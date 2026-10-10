import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { studioApi, videoApi, type InstagramPublishBody } from '../../api/client'
import type { InstagramPublishFields } from '../../types'
import CostedButton from '../cost/CostedButton'
import Switch from '../studio/Switch'
import { GENERATIONS_KEY } from './keys'
import { PROJECTS_KEY } from '../studio/keys'

const CAPTION_MAX = 2200
const POLL_MS = 4000
const ACCOUNT = '@madridonomy'

const primaryBtn =
  'min-h-10 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50'
const secondaryBtn =
  'min-h-10 rounded-md border border-line-strong px-4 py-2 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-50'

type Kind = 'studio' | 'generation'

interface KindApi {
  get: (id: number) => Promise<InstagramPublishFields>
  publish: (id: number, body: InstagramPublishBody) => Promise<InstagramPublishFields>
  listKey: readonly string[]
}

const api: Record<Kind, KindApi> = {
  studio: { get: studioApi.getProject, publish: studioApi.publishInstagram, listKey: PROJECTS_KEY },
  generation: { get: videoApi.getGeneration, publish: videoApi.publishInstagram, listKey: GENERATIONS_KEY },
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-line-strong border-t-accent motion-reduce:animate-none"
    />
  )
}

/**
 * "Publish to Instagram" for a finished video: caption + share-to-feed, a two-step confirm
 * (it posts publicly), then live status (publishing -> link / error + retry).
 */
export default function InstagramPublish({
  kind,
  id,
  defaultCaption,
  initial,
}: {
  kind: Kind
  id: number
  defaultCaption: string
  initial: InstagramPublishFields
}) {
  const queryClient = useQueryClient()
  const { get, publish, listKey } = api[kind]
  const [live, setLive] = useState<InstagramPublishFields | null>(null)
  const [attempt, setAttempt] = useState(0) // new poll cache entry per publish click, so stale results never show
  const base = live ?? initial
  const baseStatus = base.instagram_status ?? null

  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [caption, setCaption] = useState(defaultCaption.slice(0, CAPTION_MAX))
  const [shareToFeed, setShareToFeed] = useState(true)

  const publishMutation = useMutation({
    mutationFn: () => publish(id, { caption, share_to_feed: shareToFeed }),
    onSuccess: (item) => {
      setLive(item)
      setAttempt((n) => n + 1)
      setOpen(false)
      setConfirming(false)
    },
    onError: () => setConfirming(false),
  })

  // Poll the item itself while Instagram is processing the Reel (takes ~1-3 minutes).
  const poll = useQuery({
    queryKey: ['instagram-publish', kind, id, attempt],
    queryFn: () => get(id),
    enabled: baseStatus === 'publishing',
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 0,
    gcTime: 0,
  })
  // Poll results win over the local copy; when Instagram finishes, refresh the parent list.
  const fields = baseStatus === 'publishing' && poll.data ? poll.data : base
  const status = fields.instagram_status ?? null
  const polledStatus = poll.data?.instagram_status
  useEffect(() => {
    if (polledStatus && polledStatus !== 'publishing') queryClient.invalidateQueries({ queryKey: listKey })
  }, [polledStatus, queryClient, listKey])

  const tooLong = caption.length > CAPTION_MAX
  const warnings = live?.instagram_warnings ?? []

  if (status === 'publishing') {
    return (
      <div role="status" className="flex items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink">
        <Spinner />
        <span>Publishing to Instagram… this can take a few minutes.</span>
      </div>
    )
  }

  if (status === 'published') {
    return (
      <div className="space-y-1 rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm">
        <p className="font-medium text-success">Published to Instagram</p>
        {fields.instagram_permalink ? (
          <a
            href={fields.instagram_permalink}
            target="_blank"
            rel="noreferrer"
            className="break-all text-accent underline underline-offset-2"
          >
            View the Reel
          </a>
        ) : (
          <p className="text-xs text-muted">The Reel is live; Instagram did not return a link.</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {status === 'failed' && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          Instagram publish failed: {fields.instagram_error || 'unknown error'}
        </p>
      )}

      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className={secondaryBtn}>
          {status === 'failed' ? 'Retry Instagram publish' : 'Publish to Instagram'}
        </button>
      ) : (
        <div className="space-y-3 rounded-md border border-line bg-surface-2 p-3">
          <div>
            <label htmlFor={`ig-caption-${kind}-${id}`} className="mb-1 block text-xs font-medium text-muted">
              Caption
            </label>
            <textarea
              id={`ig-caption-${kind}-${id}`}
              value={caption}
              onChange={(e) => {
                setCaption(e.target.value)
                setConfirming(false)
              }}
              rows={5}
              className="w-full resize-y rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint"
              placeholder="Write a caption…"
            />
            <p className={`mt-1 text-right text-xs tabular-nums ${tooLong ? 'text-danger' : 'text-faint'}`}>
              {caption.length}/{CAPTION_MAX}
            </p>
          </div>

          <Switch
            checked={shareToFeed}
            onChange={setShareToFeed}
            label="Also show on the profile feed"
            hint="Off keeps it in the Reels tab only."
          />

          {publishMutation.isError && (
            <p role="alert" className="text-sm text-danger">
              {(publishMutation.error as Error).message}
            </p>
          )}
          {warnings.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          {confirming ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-ink">This posts publicly to {ACCOUNT} — confirm</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => publishMutation.mutate()}
                  disabled={publishMutation.isPending || tooLong}
                  className={primaryBtn}
                >
                  {publishMutation.isPending ? 'Starting…' : `Confirm and post to ${ACCOUNT}`}
                </button>
                <button type="button" onClick={() => setConfirming(false)} className={secondaryBtn}>
                  Back
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <CostedButton
                action="instagram.publish_reel"
                onClick={() => setConfirming(true)}
                disabled={tooLong}
                className={primaryBtn}
              >
                Review and publish
              </CostedButton>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  setConfirming(false)
                }}
                className={secondaryBtn}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

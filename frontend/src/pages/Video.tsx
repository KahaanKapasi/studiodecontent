import { useState } from 'react'
import Composer, { type Prefill } from '../components/video/Composer'
import GenerationGallery from '../components/video/GenerationGallery'
import IdeasScripts from '../components/video/IdeasScripts'
import StudioTab from '../components/studio/StudioTab'
import Segmented from '../components/video/Segmented'

type VideoTab = 'studio' | 'generate' | 'ideas'

export default function Video() {
  const [tab, setTab] = useState<VideoTab>('studio')
  const [prefill, setPrefill] = useState<Prefill>({ text: '', nonce: 0 })

  function handleUseAsPrompt(text: string) {
    setPrefill((p) => ({ text, nonce: p.nonce + 1 }))
    setTab('generate')
    requestAnimationFrame(() => document.querySelector('main')?.scrollTo({ top: 0 }))
  }

  function handleCreated() {
    // On narrow screens the results sit below the composer — bring them into view.
    if (window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() =>
        document.getElementById('video-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      )
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Video</h1>
          <p className="mt-1 text-sm text-faint">
            {tab === 'studio'
              ? 'Pick a recipe, review the plan, and render a finished video.'
              : tab === 'generate'
                ? 'Describe a single clip, pick a model, and get an MP4 back.'
                : 'Pick a topic, get title and script ideas, and send one to Clip.'}
          </p>
        </div>
        <Segmented
          kind="tabs"
          ariaLabel="Video sections"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'studio', label: 'Studio' },
            { value: 'generate', label: 'Clip' },
            { value: 'ideas', label: 'Ideas & scripts' },
          ]}
        />
      </div>

      {/* All panes stay mounted so drafts, polling and loaded videos survive tab switches. */}
      <div role="tabpanel" hidden={tab !== 'studio'}>
        <StudioTab />
      </div>

      <div role="tabpanel" hidden={tab !== 'generate'}>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <Composer prefill={prefill} onCreated={handleCreated} />
          <div id="video-results" className="scroll-mt-4">
            <GenerationGallery />
          </div>
        </div>
      </div>

      <div role="tabpanel" hidden={tab !== 'ideas'}>
        <IdeasScripts onUseAsPrompt={handleUseAsPrompt} />
      </div>
    </div>
  )
}

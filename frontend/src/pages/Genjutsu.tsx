import { useQuery } from '@tanstack/react-query'
import { genjutsuApi, isActiveJob } from '../api/genjutsu'
import Composer from '../components/genjutsu/Composer'
import JobCard from '../components/genjutsu/JobCard'

export default function Genjutsu() {
  const info = useQuery({ queryKey: ['genjutsu', 'info'], queryFn: genjutsuApi.info, staleTime: 60_000 })
  const jobs = useQuery({
    queryKey: ['genjutsu', 'jobs'],
    queryFn: genjutsuApi.list,
    // Poll only while something is generating; react-query pauses it in hidden tabs.
    refetchInterval: (query) => (query.state.data?.some(isActiveJob) ? 4000 : false),
  })

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Genjutsu</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Swap the people in a video for the ones in your photos, keeping the original motion, camera and timing. Upload the video, add
          reference photos, and pick a quality.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <Composer info={info.data} />

        <section aria-label="Your Genjutsu videos" className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">Your videos</h2>
          {jobs.isLoading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : jobs.error ? (
            <p role="alert" className="text-sm text-danger">
              {jobs.error.message}
            </p>
          ) : jobs.data && jobs.data.length > 0 ? (
            jobs.data.map((job) => <JobCard key={job.id} job={job} />)
          ) : (
            <p className="rounded-lg border border-dashed border-line-strong p-6 text-center text-sm text-muted">
              Nothing yet. Your finished videos will appear here.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}

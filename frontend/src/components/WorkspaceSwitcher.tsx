import { useQueryClient } from '@tanstack/react-query'
import { useWorkspace, WORKSPACES, type WorkspaceId } from '../workspace'
import Segmented from './video/Segmented'

/** Madridonomy / Footonomy / General: gates Discovery, and everything that starts from a Discovery topic follows it. */
export default function WorkspaceSwitcher() {
  const queryClient = useQueryClient()
  const [workspace, setWorkspace] = useWorkspace()
  const active = WORKSPACES.find((w) => w.id === workspace)

  function change(id: WorkspaceId) {
    setWorkspace(id)
    void queryClient.invalidateQueries({ queryKey: ['discovery'] }) // topic lists elsewhere refetch for the new workspace
  }

  return (
    <div className="mt-3 space-y-1.5">
      <Segmented
        ariaLabel="Workspace"
        value={workspace}
        onChange={change}
        options={WORKSPACES.map((w) => ({ value: w.id, label: w.label }))}
      />
      <p className="text-xs text-muted">{active?.hint}</p>
    </div>
  )
}

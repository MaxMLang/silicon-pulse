import { getAllModels, getAllRuns } from '@/lib/queries'
import { ModelsByRun } from '@/components/models/models-by-run'

export const dynamic = 'force-dynamic'

export default async function ModelsPage() {
  const [models, runs] = await Promise.all([getAllModels(), getAllRuns()])
  const completed = runs.filter(r => r.status === 'complete')

  return <ModelsByRun models={models} runs={completed} />
}

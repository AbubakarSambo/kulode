import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Badge, Button } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { platformApi } from '@/api/platform'
import type { PrintDiagnostics } from '@/api/platform'

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'medium' }) : 'never'

const TEST_PRINT_WAIT_MS = 20_000

/** The API's own message when the request was refused, otherwise the thrown error's. */
function errorMessage(error: unknown): string | undefined {
  const fromApi = (error as { response?: { data?: { message?: string } } })?.response?.data?.message
  return fromApi ?? (error instanceof Error ? error.message : undefined)
}

const JOB_BADGE: Record<PrintDiagnostics['jobs'][number]['status'], 'success' | 'destructive' | 'secondary'> = {
  SENT: 'success',
  FAILED: 'destructive',
  PENDING: 'secondary',
  DISPATCHED: 'secondary',
}

/** The first thing to check, worked out from everything below it. */
function summarise(d: PrintDiagnostics): string {
  if (!d.agent.hasToken) return 'No print agent has ever been connected for this organization.'
  if (!d.agent.lastSeenAt) return 'An agent token exists but no agent has ever checked in. The installer was probably never run, or pairing did not finish.'
  if (!d.agent.online) return `The agent is offline (last seen ${when(d.agent.lastSeenAt)}). The PC is off, signed out, or has no internet. Nothing prints until it is back.`
  if (!d.agent.version) return 'The agent is online but is an old build: no network search, no log upload. Ask them to download and run the installer again.'
  const active = d.printers.filter((p) => p.isActive)
  if (active.length === 0) return 'The agent is online, but no printers are set up.'
  const unconfigured = active.filter((p) => (p.connectionType === 'NETWORK' ? !p.ipAddress : !p.devicePath))
  if (unconfigured.length > 0) return `The agent is online, but ${unconfigured.map((p) => p.name).join(', ')} ${unconfigured.length === 1 ? 'has' : 'have'} no address yet.`
  const lastJobByPrinter = new Map<string, PrintDiagnostics['jobs'][number]>()
  for (const job of d.jobs) if (!lastJobByPrinter.has(job.printerId)) lastJobByPrinter.set(job.printerId, job)
  const failing = active.filter((p) => lastJobByPrinter.get(p.id)?.status === 'FAILED')
  if (failing.length > 0) {
    return `The agent is online, but the most recent job failed on ${failing.map((p) => `${p.name} (${lastJobByPrinter.get(p.id)?.error ?? 'no reason given'})`).join('; ')}.`
  }
  return 'The agent is online and the most recent job on every printer went through.'
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#434655]">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

export function PrinterDiagnosticsModal({
  organizationId,
  organizationName,
  onClose,
}: {
  organizationId: string
  organizationName: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const queryKey = ['platform', 'printing', organizationId]
  const [showAllJobs, setShowAllJobs] = useState(false)

  // Kept fresh while the panel is open, so a search or a test page shows up without a reload.
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => platformApi.getPrintDiagnostics(organizationId),
    refetchInterval: 4000,
  })

  const scanMutation = useMutation({
    mutationFn: () => platformApi.requestPrinterScan(organizationId),
    onSuccess: () => {
      toast.success('Search requested', { description: 'Results appear here within a few seconds if the agent is online.' })
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (e) => toast.error('Could not request a search', { description: errorMessage(e) }),
  })

  const testPrintMutation = useMutation({
    mutationFn: async (printer: { id: string; name: string }) => {
      const { jobId } = await platformApi.testPrint(organizationId, printer.id)
      const deadline = Date.now() + TEST_PRINT_WAIT_MS
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 1500))
        const job = await platformApi.getPrintJob(organizationId, jobId)
        if (job.status === 'SENT') return
        if (job.status === 'FAILED') throw new Error(job.error || 'The printer did not accept the test page.')
      }
      throw new Error('The agent did not pick up the test page.')
    },
    onSuccess: (_d, printer) => toast.success(`The agent reports the test page was sent to ${printer.name}`),
    onError: (e, printer) => toast.error(`Test print failed on ${printer.name}`, { description: errorMessage(e) }),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  const confirmTestPrint = (printer: { id: string; name: string }) => {
    if (window.confirm(`Send a test page to "${printer.name}" at ${organizationName}? Paper will come out at their location.`)) {
      testPrintMutation.mutate(printer)
    }
  }

  const jobs = data ? (showAllJobs ? data.jobs : data.jobs.filter((j) => j.status === 'FAILED')) : []

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Printers — ${organizationName}`}
      description="What the on-site print agent is doing, and why something may not be printing"
      className="max-w-4xl"
    >
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : error || !data ? (
        <p className="py-8 text-center text-sm text-destructive">Could not load printer diagnostics.</p>
      ) : (
        <div className="space-y-6">
          <p className="rounded-xl bg-[#f8f9ff] p-3 text-sm text-[#121c28]">{summarise(data)}</p>

          <Section title="Agent">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Status</dt>
                <dd>
                  {data.agent.online ? (
                    <Badge variant="success">Online</Badge>
                  ) : data.agent.lastSeenAt ? (
                    <Badge variant="warning">Offline</Badge>
                  ) : (
                    <Badge variant="secondary">Never connected</Badge>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Last seen</dt>
                <dd>{when(data.agent.lastSeenAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Version</dt>
                <dd>{data.agent.version ?? (data.agent.lastSeenAt ? 'before 1.3.0' : '—')}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Computer</dt>
                <dd className="break-all">{data.agent.hostname ?? '—'}</dd>
              </div>
            </dl>
          </Section>

          <Section title="Printers">
            {data.printers.length === 0 ? (
              <p className="text-sm text-muted-foreground">None set up.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[rgba(196,197,215,0.4)]">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Printer</th>
                      <th className="px-3 py-2 font-medium">Address</th>
                      <th className="px-3 py-2 font-medium">Prints</th>
                      <th className="px-3 py-2 font-medium">Last printed</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgba(196,197,215,0.4)]">
                    {data.printers.map((printer) => (
                      <tr key={printer.id} className={printer.isActive ? '' : 'opacity-50'}>
                        <td className="px-3 py-2">
                          <p className="font-medium">{printer.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {printer.station}
                            {!printer.isActive && ' · removed'}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {printer.connectionType === 'NETWORK' ? (
                            <>
                              <p>{printer.ipAddress ? `${printer.ipAddress}:${printer.port ?? 9100}` : 'no IP address'}</p>
                              <p className="text-muted-foreground">{printer.macAddress ?? 'hardware address not learned yet'}</p>
                            </>
                          ) : (
                            <p>
                              {printer.connectionType} · {printer.devicePath ? `\\\\localhost\\${printer.devicePath}` : 'no share name'}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">{printer.routes.length ? printer.routes.join(', ') : 'Every order'}</td>
                        <td className="px-3 py-2 text-xs">{when(printer.lastPrintedAt)}</td>
                        <td className="px-3 py-2 text-right">
                          {printer.isActive && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={testPrintMutation.isPending}
                              isLoading={testPrintMutation.isPending && testPrintMutation.variables?.id === printer.id}
                              onClick={() => confirmTestPrint(printer)}
                            >
                              Test print
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section
            title="Found on their network"
            action={
              <Button variant="outline" size="sm" isLoading={scanMutation.isPending || data.discovery.scanning} onClick={() => scanMutation.mutate()}>
                Search now
              </Button>
            }
          >
            <p className="text-xs text-muted-foreground">Last search: {when(data.discovery.scannedAt)}</p>
            {data.discovery.devices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {data.discovery.scannedAt ? 'Nothing is listening for print jobs on the same network as the PC.' : 'The agent has not reported a search yet.'}
              </p>
            ) : (
              <ul className="divide-y divide-[rgba(196,197,215,0.4)] rounded-xl border border-[rgba(196,197,215,0.4)] text-sm">
                {data.discovery.devices.map((device) => (
                  <li key={`${device.ipAddress}:${device.port}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span>
                      {device.ipAddress}:{device.port}
                      <span className="ml-2 text-xs text-muted-foreground">{device.macAddress ?? 'no hardware address'}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{device.printerName ? `Saved as ${device.printerName}` : 'Not added'}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title={showAllJobs ? `Recent jobs (last ${data.jobs.length})` : 'Recent failures'}
            action={
              <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setShowAllJobs((v) => !v)}>
                {showAllJobs ? 'Show failures only' : 'Show all recent jobs'}
              </button>
            }
          >
            {jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {showAllJobs ? 'No print jobs yet.' : `None among the last ${data.jobs.length} jobs.`}
              </p>
            ) : (
              <ul className="divide-y divide-[rgba(196,197,215,0.4)] rounded-xl border border-[rgba(196,197,215,0.4)] text-sm">
                {jobs.map((job) => (
                  <li key={job.id} className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={JOB_BADGE[job.status]}>{job.status}</Badge>
                      <span className="font-medium">{job.printerName}</span>
                      <span className="text-xs text-muted-foreground">
                        {job.type === 'TEST' ? 'Test page' : job.type === 'CANCELLED' ? 'Cancellation docket' : 'Docket'}
                        {job.tableName ? ` · ${job.tableName}` : ''}
                        {job.orderId ? ` · order ${job.orderId.slice(0, 8)}` : ''}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">{when(job.createdAt)}</span>
                    </div>
                    {job.error && <p className="mt-1 break-words text-xs text-destructive">{job.error}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Agent log">
            {data.logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing uploaded. Agents before 1.3.0 keep their log only on the PC, in %LOCALAPPDATA%\Programs\Tarione Print Agent\agent.log.
              </p>
            ) : (
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-[#0f172a] p-3 text-[11px] leading-relaxed text-slate-100">
                {data.logs.map((line) => `${when(line.loggedAt)}  ${line.message}`).join('\n')}
              </pre>
            )}
            <p className="text-xs text-muted-foreground">Newest first. The agent uploads about once a minute; lines are kept for 7 days.</p>
          </Section>
        </div>
      )}
    </Modal>
  )
}

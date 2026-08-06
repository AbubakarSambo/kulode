import { useState } from 'react'
import { Download, Upload, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui'
import { Modal } from '@/components/shared/Modal'
import { parseCsv, downloadCsv } from '@/lib/csv'
import { cn } from '@/lib/utils'

export interface CsvColumn {
  key: string
  label: string
  required?: boolean
}

interface RowResult {
  row: number
  name: string
  error: string
}

interface CsvImportModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  columns: CsvColumn[]
  sampleFilename: string
  sampleRows: (string | number)[][]
  onImportRow: (row: Record<string, string>) => Promise<void>
  onImported: () => void
}

function extractErrorMessage(err: unknown): string {
  const message = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message
  if (Array.isArray(message)) return message.join(', ')
  if (message) return message
  if (err instanceof Error && err.message) return err.message
  return 'Failed to import'
}

export function CsvImportModal({
  isOpen,
  onClose,
  title,
  columns,
  sampleFilename,
  sampleRows,
  onImportRow,
  onImported,
}: CsvImportModalProps) {
  const [rows, setRows] = useState<Record<string, string>[] | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [failures, setFailures] = useState<RowResult[]>([])
  const [successCount, setSuccessCount] = useState(0)
  const [done, setDone] = useState(false)

  const reset = () => {
    setRows(null)
    setParseError(null)
    setIsImporting(false)
    setProgress(0)
    setFailures([])
    setSuccessCount(0)
    setDone(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    reset()

    const text = await file.text()
    const parsed = parseCsv(text)
    if (parsed.length === 0) {
      setParseError('That CSV appears to be empty.')
      return
    }

    const [header, ...dataRows] = parsed
    const normalizedHeader = header.map((h) => h.trim().toLowerCase())
    const columnIndex = new Map<string, number>()
    for (const col of columns) {
      const idx = normalizedHeader.indexOf(col.label.toLowerCase())
      if (idx !== -1) columnIndex.set(col.key, idx)
    }

    const missingRequired = columns.filter((c) => c.required && !columnIndex.has(c.key))
    if (missingRequired.length > 0) {
      setParseError(`Missing required column(s): ${missingRequired.map((c) => c.label).join(', ')}`)
      return
    }

    const mapped = dataRows.map((r) => {
      const obj: Record<string, string> = {}
      for (const col of columns) {
        const idx = columnIndex.get(col.key)
        obj[col.key] = idx !== undefined ? (r[idx] ?? '').trim() : ''
      }
      return obj
    })
    setRows(mapped)
  }

  const handleImport = async () => {
    if (!rows) return
    setIsImporting(true)
    setProgress(0)
    const rowFailures: RowResult[] = []
    let ok = 0

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const missing = columns.filter((c) => c.required && !row[c.key])
      if (missing.length > 0) {
        rowFailures.push({
          row: i + 2,
          name: row[columns[0].key] || `Row ${i + 2}`,
          error: `Missing ${missing.map((c) => c.label).join(', ')}`,
        })
      } else {
        try {
          await onImportRow(row)
          ok++
        } catch (err) {
          rowFailures.push({ row: i + 2, name: row[columns[0].key] || `Row ${i + 2}`, error: extractErrorMessage(err) })
        }
      }
      setProgress(i + 1)
    }

    setSuccessCount(ok)
    setFailures(rowFailures)
    setIsImporting(false)
    setDone(true)
    if (ok > 0) onImported()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title}>
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => downloadCsv(sampleFilename, sampleRows)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted py-2.5 text-sm font-medium text-foreground hover:bg-muted/70"
        >
          <Download className="h-4 w-4" /> Download sample CSV
        </button>

        {!rows && !done && (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border py-8 text-center hover:bg-muted/40">
            <Upload className="h-6 w-6 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Click to choose a CSV file</span>
            <span className="text-xs text-muted-foreground">
              Required columns: {columns.filter((c) => c.required).map((c) => c.label).join(', ')}
            </span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
          </label>
        )}

        {parseError && <p className="text-sm text-destructive">{parseError}</p>}

        {rows && !done && (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              Found <span className="font-semibold">{rows.length}</span> row{rows.length === 1 ? '' : 's'} to import.
            </p>
            {isImporting && (
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${(progress / rows.length) * 100}%` }}
                />
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={reset} disabled={isImporting}>
                Choose Different File
              </Button>
              <Button className="flex-1" onClick={handleImport} isLoading={isImporting}>
                Import {rows.length} Row{rows.length === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        )}

        {done && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" />
              {successCount} of {successCount + failures.length} imported successfully
            </div>
            {failures.length > 0 && (
              <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl bg-muted p-3">
                {failures.map((f) => (
                  <div key={f.row} className="flex items-start gap-2 text-xs">
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                    <span className={cn('text-muted-foreground')}>
                      Row {f.row} ({f.name}): {f.error}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <Button className="w-full" onClick={handleClose}>
              Done
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}

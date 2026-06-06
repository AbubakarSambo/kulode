import fs from 'fs'

const logPath = 'C:\\Users\\tilco\\.gemini\\antigravity\\brain\\b0611231-c3e4-4c64-a694-d21847752423\\.system_generated\\logs\\transcript.jsonl'
const content = fs.readFileSync(logPath, 'utf8')
const lines = content.split('\n')

for (const line of lines) {
  if (!line.trim()) continue
  try {
    const obj = JSON.parse(line)
    if (obj.tool_calls) {
      for (const call of obj.tool_calls) {
        if (call.name === 'replace_file_content') {
          const args = typeof call.args === 'string' ? JSON.parse(call.args) : call.args
          if (args.TargetFile && args.TargetFile.includes('InvoiceForm.tsx') && args.ReplacementContent) {
            const hasTruncated = args.ReplacementContent.includes('truncated')
            console.log(`Step ${obj.step_index}: has 'truncated' marker = ${hasTruncated}, length = ${args.ReplacementContent.length}`)
          }
        }
      }
    }
  } catch (e) {
    // ignore
  }
}

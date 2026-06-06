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
          if (args.TargetFile && args.TargetFile.includes('InvoiceForm.tsx')) {
            console.log(`Step ${obj.step_index}: StartLine=${args.StartLine}, EndLine=${args.EndLine}`)
            console.log(`TargetContent prefix: ${args.TargetContent ? args.TargetContent.substring(0, 100) : 'none'}`)
            console.log(`ReplacementContent length: ${args.ReplacementContent ? args.ReplacementContent.length : 0}`)
          }
        }
      }
    }
  } catch (e) {
    // ignore
  }
}

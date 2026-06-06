import fs from 'fs'
import path from 'path'

const logPath = 'C:\\Users\\tilco\\.gemini\\antigravity\\brain\\b0611231-c3e4-4c64-a694-d21847752423\\.system_generated\\logs\\transcript.jsonl'
const content = fs.readFileSync(logPath, 'utf8')
const lines = content.split('\n')

let lastCode = null

for (const line of lines) {
  if (!line.trim()) continue
  try {
    const obj = JSON.parse(line)
    if (obj.tool_calls) {
      for (const call of obj.tool_calls) {
        if (call.name === 'write_to_file' || call.name === 'replace_file_content' || call.name === 'multi_replace_file_content') {
          const args = typeof call.args === 'string' ? JSON.parse(call.args) : call.args
          if (args.TargetFile && args.TargetFile.includes('InvoiceForm.tsx')) {
            console.log(`Found write at step ${obj.step_index}, tool: ${call.name}`)
            if (args.CodeContent) {
              lastCode = { step: obj.step_index, code: args.CodeContent, type: 'write' }
            } else if (args.ReplacementContent) {
              lastCode = { step: obj.step_index, code: args.ReplacementContent, type: 'replace', start: args.StartLine, end: args.EndLine, target: args.TargetContent }
            }
          }
        }
      }
    }
  } catch (e) {
    // ignore parse error
  }
}

if (lastCode) {
  console.log(`Last code write type: ${lastCode.type} at step ${lastCode.step}`)
  if (lastCode.type === 'write') {
    fs.writeFileSync('recovered_InvoiceForm.tsx', lastCode.code)
    console.log('Saved to recovered_InvoiceForm.tsx')
  } else {
    console.log('It was a replacement. Details:')
    console.log(`Start: ${lastCode.start}, End: ${lastCode.end}`)
    console.log(`Target length: ${lastCode.target.length}`)
    console.log(`Replacement length: ${lastCode.code.length}`)
  }
} else {
  console.log('No writes found')
}

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = path.resolve(__dirname, '../public');
const fontsDir = path.join(publicDir, 'fonts');

if (!fs.existsSync(fontsDir)) {
  fs.mkdirSync(fontsDir, { recursive: true });
}

const assets = [
  { url: 'https://cdn.hugeicons.com/font/hgi-stroke-rounded.woff2', dest: path.join(fontsDir, 'hgi-stroke-rounded.woff2') },
  { url: 'https://cdn.hugeicons.com/font/hgi-stroke-rounded.woff', dest: path.join(fontsDir, 'hgi-stroke-rounded.woff') },
  { url: 'https://cdn.hugeicons.com/font/hgi-stroke-rounded.ttf', dest: path.join(fontsDir, 'hgi-stroke-rounded.ttf') },
  { url: 'https://cdn.hugeicons.com/font/hgi-stroke-rounded.eot', dest: path.join(fontsDir, 'hgi-stroke-rounded.eot') },
  { url: 'https://cdn.hugeicons.com/font/hgi-stroke-rounded.svg', dest: path.join(fontsDir, 'hgi-stroke-rounded.svg') },
  { url: 'https://cdn.hugeicons.com/font/hgi-stroke-rounded.css', dest: path.join(fontsDir, 'hgi-stroke-rounded.css') },
  {
    url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBANxp1viD2yKWSejL3GhhfiNc0kSIhSMZM7gFJ95M9az-zYzBcd1kX-O5hubYxQnibzr8fjmVrh9cnd3K8eX7x_T9i_HDIgnhsVch5M0a-Rv0DQ2nAQkQxGCauV3Qej3GzUwubxkDhDL83tyYeU2Qtxgm_GkiA8l4lE6R-vXqNos_OANYV9ZKRfrHE1YV2Fkqxh5yxS3IQQF_7u3ulL2sMRTHuVg21hHa2FVNO7m55KeugIILhlcM7PXLH0MHsP4IPCFl6yFxhobY',
    dest: path.join(publicDir, 'team_collaboration.png')
  }
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Follow redirect
        download(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (Status Code: ${response.statusCode})`));
        return;
      }
      const file = fs.createWriteStream(dest);
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`Downloaded: ${url} -> ${dest}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function run() {
  for (const asset of assets) {
    try {
      await download(asset.url, asset.dest);
    } catch (err) {
      console.error(`Error downloading ${asset.url}:`, err);
      process.exit(1);
    }
  }

  // Post process the CSS file to use relative paths
  const cssPath = path.join(fontsDir, 'hgi-stroke-rounded.css');
  let cssContent = fs.readFileSync(cssPath, 'utf8');

  // Replace font file relative paths in CSS
  // Original is like: url("hgi-stroke-rounded.woff2?t=1721855138058")
  // We want to point them to: url("/fonts/hgi-stroke-rounded.woff2?t=1721855138058")
  // So replacing url("hgi-stroke-rounded. with url("/fonts/hgi-stroke-rounded.
  cssContent = cssContent.replaceAll('url("hgi-stroke-rounded.', 'url("/fonts/hgi-stroke-rounded.');
  cssContent = cssContent.replaceAll("url('hgi-stroke-rounded.", "url('/fonts/hgi-stroke-rounded.");

  fs.writeFileSync(cssPath, cssContent, 'utf8');
  console.log('Successfully updated CSS paths to relative paths!');
}

run();

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ffmpegDir = 'C:\\Users\\nrupa\\ffmpeg';
if (!fs.existsSync(ffmpegDir)) fs.mkdirSync(ffmpegDir, { recursive: true });

const url = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';
const zipPath = path.join(ffmpegDir, 'ffmpeg.zip');
console.log('Downloading ffmpeg...');

const file = fs.createWriteStream(zipPath);
https.get(url, (res) => {
  res.pipe(file);
  file.on('finish', () => {
    file.close();
    console.log('Extracting...');
    execSync(`tar -xf "${zipPath}" -C "${ffmpegDir}" --strip-components 1 */bin/ffmpeg.exe`, { stdio: 'inherit' });
    fs.unlinkSync(zipPath);
    const ffpath = path.join(ffmpegDir, 'ffmpeg.exe');
    console.log('ffmpeg ready at ' + ffpath);
    console.log('Add to PATH: $env:PATH = "C:\\Users\\nrupa\\ffmpeg;$env:PATH"');
  });
}).on('error', (err) => {
  console.error('Download failed:', err.message);
  process.exit(1);
});

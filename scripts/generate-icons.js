const fs = require('fs');
const zlib = require('zlib');

function crc32(buf) {
  let c = 0xffffffff;
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let cc = n;
    for (let k = 0; k < 8; k++) cc = (cc & 1) ? (0xedb88320 ^ (cc >>> 1)) : (cc >>> 1);
    table[n] = cc;
  }
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const typeB = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeB, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(crcData));
  return Buffer.concat([len, typeB, data, crc]);
}

function createPNG(size) {
  const w = size, h = size;
  const raw = Buffer.alloc(w * h * 4);
  const cx = w/2, cy = h/2, r = w * 0.42;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx*dx + dy*dy);

      const inAnvil = y > h*0.22 && y < h*0.72 && x > w*0.18 && x < w*0.82 &&
        y > h*0.22 + (x-w*0.18)*0.5 && y > h*0.22 + (w*0.82-x)*0.5;

      if (inAnvil) {
        const grad = ((x/w) + (y/h)) / 2;
        raw[idx] = Math.round(88 + grad * 80);
        raw[idx+1] = Math.round(166 - grad * 60);
        raw[idx+2] = Math.round(255 - grad * 80);
        raw[idx+3] = 255;
      } else if (dist < r) {
        const grad = dist / r;
        raw[idx] = Math.round(30 + grad * 30);
        raw[idx+1] = Math.round(50 + grad * 30);
        raw[idx+2] = Math.round(80 + grad * 40);
        raw[idx+3] = 255;
      } else if (dist < r + 3) {
        raw[idx] = 88; raw[idx+1] = 166; raw[idx+2] = 255; raw[idx+3] = 200;
      } else {
        raw[idx] = 0; raw[idx+1] = 0; raw[idx+2] = 0; raw[idx+3] = 0;
      }
    }
  }

  const sparks = [[0.4,0.35,4],[0.55,0.32,3],[0.47,0.42,2]];
  for (const [sx, sy, sr] of sparks) {
    for (let dy = -sr; dy <= sr; dy++) {
      for (let dx = -sr; dx <= sr; dx++) {
        const px = Math.round(sx * w + dx), py = Math.round(sy * h + dy);
        if (px >= 0 && px < w && py >= 0 && py < h) {
          const d = Math.sqrt(dx*dx + dy*dy);
          if (d <= sr) {
            const idx = (py * w + px) * 4;
            const alpha = Math.round(255 * (1 - d/sr));
            raw[idx] = 63 + Math.round(192 * (1 - d/sr));
            raw[idx+1] = 185 + Math.round(70 * (1 - d/sr));
            raw[idx+2] = 80 + Math.round(175 * (1 - d/sr));
            raw[idx+3] = alpha;
          }
        }
      }
    }
  }

  const deflated = zlib.deflateSync(raw);
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflated), chunk('IEND', Buffer.alloc(0))]);
}

const sizes = [32, 128, 256, 512];
for (const s of sizes) {
  const png = createPNG(s);
  let name;
  if (s === 32) name = 'media/favicon.png';
  else if (s === 128) name = 'icon.png';
  else name = 'media/icon-' + s + '.png';
  fs.writeFileSync(name, png);
  console.log('Created ' + name + ' (' + png.length + ' bytes, ' + s + 'x' + s + ')');
}
console.log('Done');

// Edit app/icon.svg, then run: node scripts/generate-icons.cjs
// All raster variants are generated locally from the same vector artwork.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');

(async () => {
  const svg = await fs.readFile(path.join(root, 'app/icon.svg'));
  const brandDirectory = path.join(root, 'public');
  await fs.mkdir(brandDirectory, { recursive: true });
  await sharp(svg).resize(256, 256).png().toFile(path.join(brandDirectory, 'brand-mark.png'));
  await sharp(svg).resize(180, 180).flatten({ background: '#6B55CE' }).png().toFile(path.join(root, 'app/apple-icon.png'));

  const sizes = [16, 32, 48];
  const images = await Promise.all(sizes.map(size => sharp(svg).resize(size, size).png().toBuffer()));
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2); // ICO format.
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  images.forEach((image, index) => {
    const entry = 6 + index * 16;
    header[entry] = sizes[index]; header[entry + 1] = sizes[index];
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(image.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
    offset += image.length;
  });
  await fs.writeFile(path.join(root, 'app/favicon.ico'), Buffer.concat([header, ...images]));
  console.log('Generated 16/32/48px favicon, 180px Apple icon, and 256px brand mark.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });

/**
 * Trims sonivox.sf2 to only guitar/bass instruments.
 * Usage: node scripts/extract-soundfont.js
 */
'use strict'

const fs = require('fs')
const path = require('path')
const { SoundFont2 } = require('soundfont2')

const IN = path.join(__dirname, '..', 'node_modules', '@coderline', 'alphatab', 'dist', 'soundfont', 'sonivox.sf2')
const OUT = path.join(__dirname, '..', 'public', 'soundfont', 'tiny.sf2')

const KEEP_PROGRAMS = new Set([25, 26, 27, 28, 29, 30, 31, 33, 34, 35, 36])

// ─── Binary helpers ────────────────────────────────────────────
function r16(b, o) { return b.readUInt16LE(o) }
function r32(b, o) { return b.readUInt32LE(o) }
function w16(v) { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b }
function w32(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b }

// Chunk sizes
const PRESET_SIZE = 38, PBAG_SIZE = 4, PMOD_SIZE = 10, PGEN_SIZE = 4
const INST_SIZE = 22, IBAG_SIZE = 4, IMOD_SIZE = 10, IGEN_SIZE = 4
const SAMPLE_HDR_SIZE = 46

// ─── Read & analyze ────────────────────────────────────────────
console.log('Reading original SF2...')
const raw = fs.readFileSync(IN)
const sf = new SoundFont2(new Uint8Array(raw))
console.log(`  ${sf.presets.length} presets, ${sf.instruments.length} instruments, ${sf.samples.length} samples`)

// Find which sample indices each preset uses (soundfont2 parsed data)
// Chain: preset > zone > instrument > instrumentZone > generators[53].value = sampleIndex
const presetSamples = new Map()
for (const p of sf.presets) {
  const program = p.header?.preset
  if (program == null || !KEEP_PROGRAMS.has(program)) continue
  const samples = new Set()
  for (const pz of p.zones || []) {
    const inst = pz.instrument
    if (!inst) continue
    for (const iz of inst.zones || []) {
      // generator type 53 = sampleID
      const sampleGen = iz.generators?.['53'] || iz.generators?.[53]
      if (sampleGen?.value !== undefined) {
        samples.add(sampleGen.value)
      }
    }
  }
  if (samples.size > 0) presetSamples.set(program, samples)
}

const neededSamples = new Set()
for (const s of presetSamples.values()) { for (const i of s) neededSamples.add(i) }
console.log(`  Keeping ${presetSamples.size} presets, ${neededSamples.size} samples`)

// ─── Parse raw RIFF chunks with offsets ─────────────────────────
// Each chunk: { id, size, dataStart, paddedEnd }
const chunkList = []
let off = 12 // skip RIFF(4) + fileSize(4) + 'sfbk'(4)
while (off + 8 <= raw.length) {
  const id = raw.subarray(off, off + 4).toString('ascii')
  const size = r32(raw, off + 4)
  const dataStart = off + 8
  const padded = size % 2 === 0 ? size : size + 1
  chunkList.push({ id, size, dataStart, paddedEnd: dataStart + padded })
  off = dataStart + padded
}

function findList(listType) {
  for (const c of chunkList) {
    if (c.id === 'LIST' && raw.subarray(c.dataStart, c.dataStart + 4).toString('ascii') === listType) {
      return raw.subarray(c.dataStart + 4, c.dataStart + c.size) // skip listType
    }
  }
  return null
}

function parseSubChunks(listBuf) {
  const sub = {}
  let o = 0
  while (o + 8 <= listBuf.length) {
    const id = listBuf.subarray(o, o + 4).toString('ascii')
    const size = r32(listBuf, o + 4)
    sub[id] = listBuf.subarray(o + 8, o + 8 + size)
    o += 8 + (size % 2 === 0 ? size : size + 1)
  }
  return sub
}

const pdtaData = findList('pdta')
const infoData = findList('INFO')
if (!pdtaData) { console.error('pdta list not found'); process.exit(1) }

const pd = parseSubChunks(pdtaData)

// ─── Parse pdta arrays ──────────────────────────────────────────
const phdr = pd['phdr']; const numPresets = Math.floor(phdr.length / PRESET_SIZE) - 1
const pbag = pd['pbag']; const numPbags = Math.floor(pbag.length / PBAG_SIZE) - 1
const pgen = pd['pgen']; const numPgens = Math.floor(pgen.length / PGEN_SIZE)
const inst = pd['inst']; const numInstruments = Math.floor(inst.length / INST_SIZE) - 1
const ibag = pd['ibag']; const numIbags = Math.floor(ibag.length / IBAG_SIZE) - 1
const igen = pd['igen']; const numIgens = Math.floor(igen.length / IGEN_SIZE)
const shdr = pd['shdr']; const numSamples = Math.floor(shdr.length / SAMPLE_HDR_SIZE) - 1

console.log(`  Raw: ${numPresets} presets, ${numInstruments} inst, ${numSamples} samples`)

// ─── Track what to keep (indices) ────────────────────────────────
const keepPreset = new Set()
const keepBag = new Set()   // preset bags
const keepGen = new Set()   // preset generators
const keepInst = new Set()
const keepIbag = new Set()
const keepIgen = new Set()
const keepSample = new Set() // sample indices

// Walk presets → bag → gen → instrument
for (let pi = 0; pi < numPresets; pi++) {
  const program = r16(phdr, pi * PRESET_SIZE + 20)
  if (!KEEP_PROGRAMS.has(program)) continue
  keepPreset.add(pi)

  const bagStart = r16(phdr, pi * PRESET_SIZE + 24)
  const bagEnd = (pi + 1 < numPresets) ? r16(phdr, (pi + 1) * PRESET_SIZE + 24) : numPbags

  for (let b = bagStart; b < bagEnd; b++) {
    keepBag.add(b)
    const genStart = r16(pbag, b * PBAG_SIZE)
    const genEnd = (b + 1 < numPbags) ? r16(pbag, (b + 1) * PBAG_SIZE) : numPgens
    for (let g = genStart; g < genEnd; g++) {
      keepGen.add(genStart + g)
      const genType = r16(pgen, (genStart + g) * PGEN_SIZE)
      if (genType === 41) { // instrument ref
        keepInst.add(r16(pgen, (genStart + g) * PGEN_SIZE + 2))
      }
    }
  }
}

// Walk instruments → bag → gen → sample
for (const ii of new Set(keepInst)) {
  if (ii >= numInstruments) continue
  const bagStart = r16(inst, ii * INST_SIZE + 20)
  const bagEnd = (ii + 1 < numInstruments) ? r16(inst, (ii + 1) * INST_SIZE + 20) : numIbags

  for (let b = bagStart; b < bagEnd; b++) {
    keepIbag.add(b)
    const genStart = r16(ibag, b * IBAG_SIZE)
    const genEnd = (b + 1 < numIbags) ? r16(ibag, (b + 1) * IBAG_SIZE) : numIgens
    for (let g = genStart; g < genEnd; g++) {
      keepIgen.add(genStart + g)
      const genType = r16(igen, (genStart + g) * IGEN_SIZE)
      if (genType === 53) { // sampleID
        keepSample.add(r16(igen, (genStart + g) * IGEN_SIZE + 2))
      }
    }
  }
}

console.log(`  Keep: ${keepPreset.size} presets, ${keepInst.size} instruments, ${keepSample.size} samples`)

// ─── Old → New index maps ────────────────────────────────────────
function buildMap(kept, total) {
  const m = new Map(); let ni = 0
  for (let i = 0; i < total; i++) if (kept.has(i)) m.set(i, ni++)
  m.set(total, ni) // terminal
  return m
}

const pMap   = buildMap(keepPreset, numPresets)
const bagMap = buildMap(keepBag, numPbags)
const iMap   = buildMap(keepInst, numInstruments)
const iBagMap = buildMap(keepIbag, numIbags)
const sMap   = buildMap(keepSample, numSamples)

// Gen maps (no terminal, just 0..count-1)
function buildGenMap(kept, total) {
  const m = new Map(); let ni = 0
  for (let i = 0; i < total; i++) if (kept.has(i)) m.set(i, ni++)
  return m
}

const genMap = buildGenMap(keepGen, numPgens)
const iGenMap = buildGenMap(keepIgen, numIgens)

// ─── Rebuild chunks ──────────────────────────────────────────────

// phdr
const newPhdr = []
for (let i = 0; i < numPresets; i++) {
  if (!keepPreset.has(i)) continue
  const o = i * PRESET_SIZE
  const e = Buffer.alloc(PRESET_SIZE); phdr.copy(e, 0, o, o + PRESET_SIZE)
  e.writeUInt16LE(bagMap.get(r16(phdr, o + 24)), 24)
  newPhdr.push(e)
}
newPhdr.push(Buffer.alloc(PRESET_SIZE))

// pbag — remap genIdx, zero mod (we're keeping all modulators, mod chain stays)
const newPbag = []
for (let i = 0; i < numPbags; i++) {
  if (!keepBag.has(i)) continue
  const o = i * PBAG_SIZE
  const e = Buffer.alloc(PBAG_SIZE)
  e.writeUInt16LE(genMap.get(r16(pbag, o)) ?? 0, 0)
  e.writeUInt16LE(0, 2) // ponytail: zero modIdx, modulators not critical for playback
  newPbag.push(e)
}
newPbag.push(Buffer.alloc(PBAG_SIZE))

// pgen
const newPgen = []
for (const i of [...keepGen].sort((a, b) => a - b)) {
  const o = i * PGEN_SIZE
  const e = Buffer.alloc(PGEN_SIZE); pgen.copy(e, 0, o, o + PGEN_SIZE)
  if (r16(e, 0) === 41) { // instrument ref
    const ni = iMap.get(r16(e, 2))
    if (ni !== undefined) e.writeUInt16LE(ni, 2)
  }
  newPgen.push(e)
}

// pmod — keep all modulators verbatim (they're tiny, ~1KB total)
const newPmod = pd['pmod'] || Buffer.alloc(0)

// inst
const newInst = []
for (let i = 0; i < numInstruments; i++) {
  if (!keepInst.has(i)) continue
  const o = i * INST_SIZE
  const e = Buffer.alloc(INST_SIZE); inst.copy(e, 0, o, o + INST_SIZE)
  e.writeUInt16LE(iBagMap.get(r16(inst, o + 20)), 20)
  newInst.push(e)
}
newInst.push(Buffer.alloc(INST_SIZE))

// ibag
const newIbag = []
for (let i = 0; i < numIbags; i++) {
  if (!keepIbag.has(i)) continue
  const o = i * IBAG_SIZE
  const e = Buffer.alloc(IBAG_SIZE)
  e.writeUInt16LE(iGenMap.get(r16(ibag, o)) ?? 0, 0)
  e.writeUInt16LE(0, 2) // ponytail: zero modIdx
  newIbag.push(e)
}
newIbag.push(Buffer.alloc(IBAG_SIZE))

// igen
const newIgen = []
for (const i of [...keepIgen].sort((a, b) => a - b)) {
  const o = i * IGEN_SIZE
  const e = Buffer.alloc(IGEN_SIZE); igen.copy(e, 0, o, o + IGEN_SIZE)
  if (r16(e, 0) === 53) { // sampleID
    const ns = sMap.get(r16(e, 2))
    if (ns !== undefined) e.writeUInt16LE(ns, 2)
  }
  newIgen.push(e)
}

// imod — keep all verbatim
const newImod = pd['imod'] || Buffer.alloc(0)

// shdr + smpl data
// Parse old sample ranges
const oldSampleRanges = []
for (let i = 0; i < numSamples; i++) {
  const o = i * SAMPLE_HDR_SIZE
  oldSampleRanges.push({
    start: r32(shdr, o + 20),
    end: r32(shdr, o + 24),
    startLoop: r32(shdr, o + 28),
    endLoop: r32(shdr, o + 32),
    sampleRate: r32(shdr, o + 36),
    originalPitch: shdr.readUInt8(o + 40),
    pitchCorrection: shdr.readInt8(o + 41),
    sampleLink: r16(shdr, o + 42),
    sampleType: r16(shdr, o + 44),
  })
}

const smplData = findSmplData()
function findSmplData() {
  for (const c of chunkList) {
    if (c.id === 'LIST' && raw.subarray(c.dataStart, c.dataStart + 4).toString('ascii') === 'sdta') {
      const sdtaData = raw.subarray(c.dataStart + 4, c.dataStart + c.size)
      const sd = parseSubChunks(sdtaData)
      return sd['smpl'] || Buffer.alloc(0)
    }
  }
  return Buffer.alloc(0)
}

const newSmplParts = []
const newShdr = []

for (let oldIdx = 0; oldIdx < numSamples; oldIdx++) {
  if (!keepSample.has(oldIdx)) continue
  const r = oldSampleRanges[oldIdx]
  const len = r.end - r.start
  const newStart = Buffer.concat(newSmplParts).length
  const newEnd = newStart + len

  if (r.start + len <= smplData.length) {
    newSmplParts.push(smplData.subarray(r.start, r.start + len))
  }

  const h = Buffer.alloc(SAMPLE_HDR_SIZE)
  shdr.copy(h, 0, oldIdx * SAMPLE_HDR_SIZE, oldIdx * SAMPLE_HDR_SIZE + 20)
  h.writeUInt32LE(newStart, 20)
  h.writeUInt32LE(newEnd, 24)
  h.writeUInt32LE(newStart + (r.startLoop - r.start), 28)
  h.writeUInt32LE(newStart + (r.endLoop - r.start), 32)
  h.writeUInt32LE(r.sampleRate, 36)
  h.writeUInt8(r.originalPitch, 40)
  h.writeInt8(r.pitchCorrection, 41)
  h.writeUInt16LE(r.sampleLink, 42)
  h.writeUInt16LE(r.sampleType, 44)
  newShdr.push(h)
}
newShdr.push(Buffer.alloc(SAMPLE_HDR_SIZE))

// ─── Assemble RIFF ────────────────────────────────────────────────
function makeChunk(id, data) {
  const header = Buffer.concat([Buffer.from(id, 'ascii'), w32(data.length)])
  const padded = data.length % 2 === 0 ? data : Buffer.concat([data, Buffer.alloc(1)])
  return Buffer.concat([header, padded])
}

function makeList(type, chunks) {
  const inner = Buffer.concat(chunks)
  return makeChunk('LIST', Buffer.concat([Buffer.from(type, 'ascii'), inner]))
}

const pdtaChunks = makeList('pdta', [
  makeChunk('phdr', Buffer.concat(newPhdr)),
  makeChunk('pbag', Buffer.concat(newPbag)),
  makeChunk('pmod', newPmod),
  makeChunk('pgen', Buffer.concat(newPgen)),
  makeChunk('inst', Buffer.concat(newInst)),
  makeChunk('ibag', Buffer.concat(newIbag)),
  makeChunk('imod', newImod),
  makeChunk('igen', Buffer.concat(newIgen)),
  makeChunk('shdr', Buffer.concat(newShdr)),
])

const sdtaChunks = makeList('sdta', [makeChunk('smpl', Buffer.concat(newSmplParts))])

// Copy INFO as-is
let infoChunk = Buffer.alloc(0)
for (const c of chunkList) {
  if (c.id === 'LIST') {
    const t = raw.subarray(c.dataStart, c.dataStart + 4).toString('ascii')
    if (t === 'INFO') {
      infoChunk = raw.subarray(c.dataStart - 8, c.paddedEnd) // include header
      break
    }
  }
}

const body = Buffer.concat([infoChunk, sdtaChunks, pdtaChunks])
const riff = Buffer.alloc(12)
riff.write('RIFF', 0, 'ascii')
riff.writeUInt32LE(body.length + 4, 4) // +4 for 'sfbk'
riff.write('sfbk', 8, 'ascii')

const output = Buffer.concat([riff, body])

const outDir = path.dirname(OUT)
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(OUT, output)

console.log(`\nDone! ${(raw.length / 1024).toFixed(0)} KB → ${(output.length / 1024).toFixed(0)} KB (${(100 * output.length / raw.length).toFixed(0)}%)`)
console.log(`Saved to ${OUT}`)

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as alphaTab from '@coderline/alphatab'

interface Props {
  data: ArrayBuffer
  tabId: string
  token: string
  onSave: (data: Uint8Array, filename: string) => Promise<void>
}

interface Cursor {
  barIndex: number
  voiceIndex: number
  beatIndex: number
  stringIndex: number
}

// ponytail: lossy beat snapshot for copy/paste (covers the common props). BeatCloner
// isn't public; upgrade to a full clone if effect fidelity ever matters.
interface NoteSnap { string: number; fret: number; isGhost?: boolean; isDead?: boolean; isPalmMute?: boolean; isLetRing?: boolean; isStaccato?: boolean; vibrato?: number; accentuated?: number; harmonicType?: number }
interface BeatSnap { duration: number; dots: number; isRest: boolean; notes: NoteSnap[] }

const FRET_TABLE = {
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
}

// AlphaTab enum values (numeric literals — ponytail: avoids runtime import issues)
const D = { Whole: 1, Half: 2, Quarter: 4, Eighth: 8, Sixteenth: 16, ThirtySecond: 32, SixtyFourth: 64 }
const A = { None: 0, Normal: 1, Heavy: 2, Tenuto: 3 }
const V = { None: 0, Slight: 1, Wide: 2 }
const H = { None: 0, Natural: 1, Artificial: 2, Pinch: 3, Tap: 4, Semi: 5, Feedback: 6 }
const SI = { None: 0, IntoFromBelow: 1, IntoFromAbove: 2 }
const SO = { None: 0, Shift: 1, Legato: 2, OutUp: 3, OutDown: 4, PickSlideDown: 5, PickSlideUp: 6 }
const PS = { None: 0, Up: 1, Down: 2 }
const GT = { None: 0, OnBeat: 1, BeforeBeat: 2 }
const BT = { None: 0, Custom: 1, Bend: 2, Release: 3, BendRelease: 4, Hold: 5, Prebend: 6, PrebendBend: 7, PrebendRelease: 8 }
const CT = { None: 0, Crescendo: 1, Decrescendo: 2 }
const DYN = { PPP:0, PP:1, P:2, MP:3, MF:4, F:5, FF:6, FFF:7 }

export default function TabEditor({ data, tabId, token, onSave }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<alphaTab.AlphaTabApi | null>(null)
  const scoreRef = useRef<any>(null)
  const undoStackRef = useRef<Uint8Array[]>([])
  const redoStackRef = useRef<Uint8Array[]>([])
  const MAX_HISTORY = 50
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [tracks, setTracks] = useState<{ index: number; name: string }[]>([])
  const [selectedTrack, setSelectedTrack] = useState(0)
  const [saving, setSaving] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const editModeRef = useRef(false)
  const selectedTrackRef = useRef(0)
  const hoveredBarRef = useRef(-1)
  const cursorRef = useRef<Cursor | null>(null)
  const selectionStartRef = useRef<Cursor | null>(null)
  const isDraggingRef = useRef(false)
  const pointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const shiftDownRef = useRef(false)
  const batchingRef = useRef(false)
  const clipboardRef = useRef<BeatSnap[]>([])
  const [cursor, setCursor] = useState<Cursor | null>(null)
  const [fretInput, setFretInput] = useState<string>('')
  const [stringCount, setStringCount] = useState(6)
  const [barHighlight, setBarHighlight] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [noteHighlights, setNoteHighlights] = useState<{ x: number; y: number; w: number; h: number }[]>([])
  const [selectionBounds, setSelectionBounds] = useState<{ x: number; y: number; w: number; h: number }[]>([])
  const [selectionRange, setSelectionRange] = useState<{ start: Cursor; end: Cursor } | null>(null)

  // Track mouse position (in at-wrap content coords) so beat clicks/drags resolve which string line was hit.
  useEffect(() => {
    function track(e: MouseEvent) {
      const el = containerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      pointerRef.current = { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    function onDown(e: MouseEvent) { track(e); shiftDownRef.current = e.shiftKey }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('mousemove', track, true)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('mousemove', track, true)
    }
  }, [])

  useEffect(() => { editModeRef.current = editMode }, [editMode])
  useEffect(() => { selectedTrackRef.current = selectedTrack }, [selectedTrack])
  useEffect(() => { cursorRef.current = cursor }, [cursor])

  const getApi = () => apiRef.current

  // --- Init ---
  useEffect(() => {
    if (!containerRef.current) return
    setError('')
    setEditMode(false)
    setCursor(null)
    setFretInput('')
    if (apiRef.current) { apiRef.current.destroy(); apiRef.current = null }

    try {
      const api = new alphaTab.AlphaTabApi(containerRef.current, {
        core: { engine: 'html5', fontDirectory: '/font/', includeNoteBounds: true },
        display: { layoutMode: 'page' },
        player: { enablePlayer: false, enableCursor: true, enableElementHighlighting: true, enableUserInteraction: true },
      })
      apiRef.current = api

      const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(data))
      scoreRef.current = score
      api.renderScore(score, [0])

      const trackList = score.tracks.map((t: any, i: number) => ({ index: i, name: t.name || `Track ${i + 1}` }))
      setTracks(trackList)

      const firstStave = score.tracks[0]?.staves[0]
      if (firstStave) setStringCount(firstStave.stringTuning?.tunings?.length || 6)

      function restoreCursorHighlight(cur: Cursor) {
        setBarHighlight(null)
        setNoteHighlights(getCursorHighlightBoxes(cur))
      }

      api.beatMouseDown.on((beat: any) => {
        if (!editModeRef.current) return
        if (!beat) return
        try {
          const pos = findBeatPosition(beat, selectedTrackRef.current)
          if (!pos) return
          // Resolve which string line was clicked from the mouse Y (any line, incl. empty).
          pos.stringIndex = stringIndexFromPointerY(beat)
          // Shift+Click extends the selection from the current cursor (TuxGuitar-style)
          if (shiftDownRef.current && cursorRef.current) {
            selectRange(cursorRef.current, pos)
            setFretInput('')
            return
          }
          selectionStartRef.current = pos
          isDraggingRef.current = true
          setCursor(pos)
          setSelectionRange(null)
          setSelectionBounds([])
          setFretInput('')
        } catch { /* */ }
      })
      api.noteMouseDown.on((note: any) => {
        if (!editModeRef.current) return
        try {
          if (!note?.beat) return
          const pos = findBeatPosition(note.beat, selectedTrackRef.current)
          if (!pos) return
          pos.stringIndex = stringIndexForNote(note.string) // note.string is bottom-up; cursor is top-down
          if (shiftDownRef.current && cursorRef.current) {
            selectRange(cursorRef.current, pos)
            setFretInput('')
            return
          }
          selectionStartRef.current = pos
          isDraggingRef.current = true
          setCursor(pos)
          setSelectionRange(null)
          setSelectionBounds([])
          setFretInput('')
        } catch { /* */ }
      })

      // Note hover + drag selection in edit mode
      api.beatMouseMove.on((beat: any) => {
        if (!editModeRef.current) return
        if (!beat) return
        try {
          const barIdx = beat.voice?.bar?.index
          if (barIdx === undefined) return

          // Hover highlight (skip if dragging)
          if (!isDraggingRef.current && barIdx !== hoveredBarRef.current) {
            hoveredBarRef.current = barIdx
            const bounds = (api.renderer.boundsLookup as any)?.findBeat(beat)
            const vb = bounds?.visualBounds || bounds?.realBounds
            if (vb) {
              setNoteHighlights([])
              setBarHighlight({ x: vb.x, y: vb.y, w: vb.w, h: vb.h })
            }
          }

          // Drag selection
          if (isDraggingRef.current && selectionStartRef.current) {
            const pos = findBeatPosition(beat, selectedTrackRef.current)
            if (!pos) return
            pos.stringIndex = stringIndexFromPointerY(beat) // follow the string under the cursor
            const start = selectionStartRef.current

            // Check if we moved far enough (different beat or string)
            if (pos.barIndex === start.barIndex && pos.beatIndex === start.beatIndex && pos.voiceIndex === start.voiceIndex && pos.stringIndex === start.stringIndex) return

            setSelectionRange({
              start: { ...start },
              end: { ...pos },
            })

            // Compute visual bounds for the selection
            updateSelectionBounds(start, pos)
          }
        } catch { /* */ }
      })
      api.beatMouseUp.on((beat: any) => {
        isDraggingRef.current = false

        if (beat === null) {
          hoveredBarRef.current = -1
          // Restore cursor or selection highlight
          const cur = cursorRef.current
          if (cur) {
            restoreCursorHighlight(cur)
          } else if (selectionRange) {
            // Keep selection
          } else {
            setBarHighlight(null)
          }
          return
        }

        // Single click (no drag) — already handled by beatMouseDown
        // Drag finished — keep selection
        if (selectionStartRef.current) {
          selectionStartRef.current = null
        }
      })

      setLoaded(true)
      return () => {
        api.destroy()
        apiRef.current = null
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load tab')
    }
  }, [data])

  // --- History ---
  function pushHistory() {
    const score = scoreRef.current
    if (!score) return
    try {
      const exporter = new alphaTab.exporter.Gp7Exporter()
      const bytes = exporter.export(score)
      undoStackRef.current.push(bytes)
      if (undoStackRef.current.length > MAX_HISTORY) undoStackRef.current.shift()
      redoStackRef.current = []
    } catch { /* */ }
  }

  function undo() {
    const stack = undoStackRef.current
    if (stack.length === 0) return
    const api = getApi()
    if (!api) return
    try {
      // Save current state to redo
      const score = scoreRef.current
      if (score) {
        const exporter = new alphaTab.exporter.Gp7Exporter()
        redoStackRef.current.push(exporter.export(score))
      }
      // Restore previous state
      const bytes = stack.pop()!
      const restored = alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes)
      scoreRef.current = restored
      api.renderScore(restored, [selectedTrackRef.current])
      setCursor(null)
      setFretInput('')
      setSelectionRange(null)
      setSelectionBounds([])
    } catch { /* */ }
  }

  function redo() {
    const stack = redoStackRef.current
    if (stack.length === 0) return
    const api = getApi()
    if (!api) return
    try {
      // Save current state to undo
      const score = scoreRef.current
      if (score) {
        const exporter = new alphaTab.exporter.Gp7Exporter()
        undoStackRef.current.push(exporter.export(score))
      }
      // Restore next state
      const bytes = stack.pop()!
      const restored = alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes)
      scoreRef.current = restored
      api.renderScore(restored, [selectedTrackRef.current])
      setCursor(null)
      setFretInput('')
      setSelectionRange(null)
      setSelectionBounds([])
    } catch { /* */ }
  }

  // --- Re-render helper ---
  const rerender = useCallback(() => {
    const api = getApi()
    const score = scoreRef.current
    if (!api || !score) return
    try {
      api.renderScore(score, [selectedTrack])
    } catch { /* */ }
  }, [selectedTrack])

  // Highlight note at cursor (only when no active selection)
  useEffect(() => {
    const api = getApi()
    if (!api || !editMode || !cursor || selectionRange) {
      if (selectionRange) setBarHighlight(null)
      setNoteHighlights([])
      return
    }

    const score = scoreRef.current
    if (!score) return

    try {
      const beat = getBeatAtCursor(cursor)
      if (!beat) return

      const boundsLookup = (api.renderer.boundsLookup as any)
      const beatBounds = boundsLookup?.findBeat(beat)
      const vb = beatBounds?.visualBounds || beatBounds?.realBounds
      if (!vb) return

      const atWrap = containerRef.current
      if (!atWrap) return

      // Highlight the cursor's string in every staff (note head if present, else the line)
      const boxes = getCursorHighlightBoxes(cursor)
      setNoteHighlights(boxes)
      setBarHighlight(null)

      // Scroll to center
      const containerHeight = atWrap.clientHeight || 500
      const scrollY = boxes[0]?.y ?? vb.y
      const targetY = scrollY - containerHeight / 3
      atWrap.scrollTo?.({ top: Math.max(0, targetY), behavior: 'smooth' })
    } catch { /* */ }
  }, [cursor, editMode, selectionRange])

  // --- Cursor helpers ---
  function getBeatAtCursor(c: Cursor, trackIdx?: number) {
    const score = scoreRef.current
    if (!score) return null
    const ti = trackIdx ?? selectedTrackRef.current
    try {
      return score.tracks[ti]?.staves[0]?.bars[c.barIndex]?.voices[c.voiceIndex]?.beats[c.beatIndex] || null
    } catch { return null }
  }

  function getNoteAtCursor(c: Cursor) {
    const beat = getBeatAtCursor(c)
    if (!beat) return null
    return beat.notes?.find((n: any) => n.string === noteStringFor(c.stringIndex)) || null
  }

  // The tablature staff's bar bounds for a beat (consistent full-staff-line geometry),
  // identified via the actual staff flags rather than guessing by position.
  function tabBarBand(beat: any): { x: number; y: number; w: number; h: number } | null {
    const api = getApi()
    const all = (api?.renderer.boundsLookup as any)?.findBeats(beat) || []
    const barBounds = all.map((b: any) => b.barBounds).filter(Boolean)
    // Prefer the staff that actually shows tablature; else the bottom-most staff.
    let bar = barBounds.find((bb: any) => bb.bar?.staff?.showTablature && !bb.bar?.staff?.isPercussion)
    if (!bar && barBounds.length) {
      bar = [...barBounds].sort((a: any, b: any) =>
        ((b.visualBounds || b.realBounds)?.y || 0) - ((a.visualBounds || a.realBounds)?.y || 0))[0]
    }
    return bar?.visualBounds || bar?.realBounds || null
  }

  // Snap the current pointer Y to the nearest string line of the beat's tab staff (0-based).
  function stringIndexFromPointerY(beat: any): number {
    const band = tabBarBand(beat)
    if (!band) return cursorRef.current?.stringIndex ?? 0
    const nStrings = tabStringCount()
    const spacing = band.h / Math.max(1, nStrings - 1)
    const s = Math.round((pointerRef.current.y - band.y) / spacing)
    return Math.max(0, Math.min(nStrings - 1, s))
  }

  // Number of tab strings for the current track (read from the model, not stale state).
  function tabStringCount() {
    const staff = scoreRef.current?.tracks[selectedTrackRef.current]?.staves[0]
    return staff?.tuning?.length || stringCount || 6
  }

  // cursor.stringIndex is 0-based from the TOP tab line. alphaTab's note.string is
  // 1-based from the BOTTOM (string 1 = lowest pitch = bottom line). So they're inverted.
  function noteStringFor(stringIndex: number) { return tabStringCount() - stringIndex }
  function stringIndexForNote(noteString: number) { return tabStringCount() - noteString }

  // ponytail: a beat renders in both the notation staff and the tab staff — findBeats
  // returns one BeatBounds per staff. For each staff: highlight the exact note head if
  // there's a note on the cursor's string, otherwise a strip on that string's line so
  // empty strings are still selectable/visible.
  function getCursorHighlightBoxes(c: Cursor): { x: number; y: number; w: number; h: number }[] {
    const api = getApi()
    if (!api) return []
    const beat = getBeatAtCursor(c)
    if (!beat) return []
    const allBounds = (api.renderer.boundsLookup as any)?.findBeats(beat) || []
    const nStrings = tabStringCount()
    const boxes: { x: number; y: number; w: number; h: number }[] = []
    for (const bb of allBounds) {
      let head: any = null
      for (const nb of bb.notes || []) {
        if (nb.note?.string === noteStringFor(c.stringIndex) && nb.noteHeadBounds) { head = nb.noteHeadBounds; break }
      }
      if (head) {
        boxes.push({ x: head.x, y: head.y, w: head.w, h: head.h })
      } else {
        // No note on this string: draw a strip on the line. Use the bar's bounds for the
        // vertical line geometry (consistent full-staff height) and the beat's for x/width.
        const beatVb = bb.visualBounds || bb.realBounds
        const band = bb.barBounds?.visualBounds || bb.barBounds?.realBounds || beatVb
        if (beatVb && band) {
          const spacing = band.h / Math.max(1, nStrings - 1)
          const lineY = band.y + c.stringIndex * spacing
          const sh = band.h / nStrings
          boxes.push({ x: beatVb.x, y: lineY - sh / 2, w: beatVb.w, h: sh })
        }
      }
    }
    return boxes
  }

  // --- Navigation helpers ---
  function findBeatPosition(beat: any, trackIdx: number): Cursor | null {
    const score = scoreRef.current
    if (!score) return null
    const track = score.tracks[trackIdx]
    if (!track) return null
    const bars = track.staves[0]?.bars || []
    for (let bi = 0; bi < bars.length; bi++) {
      for (let vi = 0; vi < bars[bi].voices.length; vi++) {
        const biIndex = bars[bi].voices[vi].beats.indexOf(beat)
        if (biIndex !== -1) {
          return { barIndex: bi, voiceIndex: vi, beatIndex: biIndex, stringIndex: 0 }
        }
      }
    }
    return null
  }

  // --- Keyboard handler ---
  useEffect(() => {
    if (!editMode) return

    function onKeyDown(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return

      // Ctrl+Z / Ctrl+Y: undo/redo
      if ((e.key === 'z' || e.key === 'Z') && e.ctrlKey && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }
      if ((e.key === 'y' || e.key === 'Y') && e.ctrlKey) {
        e.preventDefault()
        redo()
        return
      }

      // Ctrl+C / X / V: copy / cut / paste beats (TuxGuitar)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && ['c', 'x', 'v'].includes(e.key.toLowerCase())) {
        e.preventDefault()
        const k = e.key.toLowerCase()
        if (k === 'c') copySelection()
        else if (k === 'x') cutSelection()
        else pasteClipboard()
        return
      }

      // Backspace / Delete with selection: bulk delete
      if (selectionRange && (e.key === 'Backspace' || e.key === 'Delete')) {
        e.preventDefault()
        removeSelection()
        return
      }

      if (!cursor) return

      // Ctrl+Del: clean the whole beat (TuxGuitar)
      if (e.key === 'Delete' && e.ctrlKey) {
        e.preventDefault()
        setFretInput('')
        cleanBeat(cursor)
        return
      }

      // Insert: add an empty rest beat after the cursor (TuxGuitar)
      if (e.key === 'Insert') {
        e.preventDefault()
        setFretInput('')
        insertRestBeat(cursor)
        return
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        // Mid multi-digit entry: drop the last digit live; otherwise remove the note.
        if (fretInput.length > 1) {
          const next = fretInput.slice(0, -1)
          setFretInput(next)
          commitFret(next, false)
        } else {
          setFretInput('')
          removeNoteAtCursor(cursor)
        }
        return
      }

      // Digit: place the fret live on the tab (TuxGuitar-style). A fresh position
      // replaces; a second digit while still selected accumulates (e.g. 1 then 2 = 12).
      if (/^[0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        const startingNew = fretInput === ''
        let next = startingNew ? e.key : fretInput + e.key
        if (parseInt(next, 10) > 24) next = e.key // overflow → start over from this digit
        setFretInput(next)
        commitFret(next, startingNew) // push history only on the first digit of the entry
        return
      }

      // Enter: end the current entry (value already committed live)
      if (e.key === 'Enter') {
        e.preventDefault()
        setFretInput('')
        return
      }

      // Shift+Left/Right: extend a beat selection from the anchor (TuxGuitar-style)
      if (e.shiftKey && !e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        setFretInput('')
        const anchor = selectionRange ? selectionRange.start : cursor
        const focus = nextBeatPos(cursor, e.key === 'ArrowLeft' ? 'left' : 'right')
        selectRange(anchor, focus)
        return
      }

      // Measure navigation: Ctrl+Left/Right (prev/next), +Shift (first/last)
      if (e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        setFretInput('')
        gotoMeasure(e.shiftKey ? (e.key === 'ArrowLeft' ? 'first' : 'last') : (e.key === 'ArrowLeft' ? 'prev' : 'next'))
        return
      }

      // TuxGuitar single-key shortcuts. With a selection active, apply to every
      // selected note/beat; otherwise to the single note/beat at the cursor.
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const hasSel = !!selectionRange
        const noteFns: Record<string, (c: Cursor) => void> = {
          b: toggleBend,
          h: toggleHammerPull,
          s: toggleSlide,
          v: toggleVibrato,
          l: toggleTie,
          x: (c) => toggleNoteProp(c, 'dead'),
          p: (c) => toggleNoteProp(c, 'palmMute'),
          o: (c) => toggleNoteProp(c, 'ghost'),
        }
        const beatFns: Record<string, (c: Cursor) => void> = {
          g: cycleGrace,
          f: cycleFade,
          '*': toggleDot,
          '/': toggleTuplet,
          '+': (c) => stepDuration(c, true),
          '-': (c) => stepDuration(c, false),
        }
        const k = e.key.toLowerCase()
        const nf = noteFns[k]
        if (nf) { e.preventDefault(); hasSel ? applyNoteEffectToSelection(nf) : nf(cursor); return }
        const bf = beatFns[k]
        if (bf) { e.preventDefault(); hasSel ? applyBeatEffectToSelection(bf) : bf(cursor); return }
      }

      // Shift+Up/Down: move the note to the string above/below (TuxGuitar)
      if (e.shiftKey && !e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault()
        setFretInput('')
        moveNoteToString(e.key === 'ArrowUp')
        return
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault()
        setFretInput('') // already committed; just move
        if (selectionRange) clearSelection() // a plain arrow collapses the selection
        moveCursor(e.key as 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editMode, cursor, fretInput, selectionRange])

  // --- Mutations ---

  // Apply a fret value to the cursor immediately. pushHist=true starts an undo step
  // (used on the first digit so a whole multi-digit entry is one undo).
  function commitFret(fretStr: string, pushHist: boolean) {
    if (!cursor || fretStr === '') return
    const fret = parseInt(fretStr, 10)
    if (isNaN(fret)) return

    const beat = getBeatAtCursor(cursor)
    if (!beat) return
    if (pushHist) pushHistory()

    const existing = beat.notes?.find((n: any) => n.string === noteStringFor(cursor.stringIndex))
    if (existing) {
      existing.fret = fret
      try { beat.updateDurations() } catch { /* */ }
      try { beat.chain() } catch { /* */ }
      rerender() // existing note: cheap in-place re-render
    } else {
      const Note = alphaTab.model?.Note || (alphaTab as any).Note
      if (!Note) return
      const note = new Note()
      note.string = noteStringFor(cursor.stringIndex) // top line = highest string number
      note.fret = fret
      // Placing a note on an empty/rest beat: isRest is a getter (= isEmpty || no notes),
      // so clear isEmpty instead of assigning isRest (which throws).
      beat.isEmpty = false
      beat.addNote(note)
      try { beat.updateDurations() } catch { /* */ }
      try { beat.chain() } catch { /* */ }
      // ponytail: a freshly built Note isn't fully finalized for layout — round-trip
      // through GP7 (same path undo uses) to get a render-ready model.
      reimportAndRender()
    }
  }

  // Export the current score and reload it so the model is fully finalized for rendering.
  function reimportAndRender() {
    const api = getApi()
    const score = scoreRef.current
    if (!api || !score) return
    try {
      const bytes = new alphaTab.exporter.Gp7Exporter().export(score)
      const restored = alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes)
      scoreRef.current = restored
      api.renderScore(restored, [selectedTrackRef.current])
    } catch { rerender() }
  }

  function removeNoteAtCursor(c: Cursor) {
    if (!c) return
    pushHistory()
    const beat = getBeatAtCursor(c)
    if (!beat || !beat.notes) return

    // ponytail: direct splice — more reliable than beat.removeNote
    const idx = beat.notes.findIndex((n: any) => n.string === noteStringFor(c.stringIndex))
    if (idx === -1) return
    beat.notes.splice(idx, 1)

    try { beat.updateDurations() } catch { /* */ }
    try { beat.chain() } catch { /* */ }
    rerender()
  }

  function removeSelection() {
    if (!selectionRange) return
    pushHistory()
    const { start, end } = selectionRange
    const sBar = Math.min(start.barIndex, end.barIndex)
    const eBar = Math.max(start.barIndex, end.barIndex)
    const sBeat = start.barIndex === end.barIndex ? Math.min(start.beatIndex, end.beatIndex) : (start.barIndex < end.barIndex ? start.beatIndex : end.beatIndex)
    const eBeat = start.barIndex === end.barIndex ? Math.max(start.beatIndex, end.beatIndex) : (start.barIndex < end.barIndex ? end.beatIndex : start.beatIndex)

    const score = scoreRef.current
    const bars = score?.tracks[selectedTrack]?.staves[0]?.bars || []
    const sr = selStringRange() // only delete notes within the selected string range

    for (let bi = sBar; bi <= eBar; bi++) {
      const bar = bars[bi]
      if (!bar) continue
      const voice = bar.voices[start.voiceIndex]
      if (!voice) continue
      const startB = bi === sBar ? sBeat : 0
      const endB = bi === eBar ? eBeat : (voice.beats.length || 1) - 1
      for (let bj = startB; bj <= endB; bj++) {
        const beat = voice.beats[bj]
        if (!beat?.notes) continue
        beat.notes = sr
          ? beat.notes.filter((n: any) => stringIndexForNote(n.string) < sr.min || stringIndexForNote(n.string) > sr.max)
          : []
        try { beat.updateDurations() } catch { /* */ }
        try { beat.chain() } catch { /* */ }
      }
    }

    setSelectionRange(null)
    setSelectionBounds([])
    rerender()
  }

  function moveCursor(dir: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight') {
    if (!cursor) return

    const score = scoreRef.current
    const bars = score.tracks[selectedTrack]?.staves[0]?.bars || []
    let { barIndex, voiceIndex, beatIndex, stringIndex } = cursor

    switch (dir) {
      case 'ArrowUp':
        stringIndex = Math.max(0, stringIndex - 1)
        break
      case 'ArrowDown':
        stringIndex = Math.min(stringCount - 1, stringIndex + 1)
        break
      case 'ArrowLeft':
        if (beatIndex > 0) {
          beatIndex--
        } else if (barIndex > 0) {
          barIndex--
          const prevBar = bars[barIndex]
          if (prevBar?.voices[voiceIndex]) {
            beatIndex = Math.max(0, prevBar.voices[voiceIndex].beats.length - 1)
          }
        }
        break
      case 'ArrowRight':
        {
          const currentBar = bars[barIndex]
          const beats = currentBar?.voices[voiceIndex]?.beats || []
          if (beatIndex < beats.length - 1) {
            beatIndex++
          } else if (barIndex < bars.length - 1) {
            barIndex++
            beatIndex = 0
          }
        }
        break
    }

    setCursor({ barIndex, voiceIndex, beatIndex, stringIndex })
  }

  // Jump the cursor between measures (TuxGuitar Ctrl+Left/Right, Ctrl+Shift+Left/Right).
  function gotoMeasure(where: 'first' | 'last' | 'prev' | 'next') {
    if (!cursor) return
    const bars = scoreRef.current?.tracks[selectedTrack]?.staves[0]?.bars || []
    if (!bars.length) return
    let bi = cursor.barIndex
    if (where === 'first') bi = 0
    else if (where === 'last') bi = bars.length - 1
    else if (where === 'prev') bi = Math.max(0, bi - 1)
    else bi = Math.min(bars.length - 1, bi + 1)
    setCursor({ ...cursor, barIndex: bi, beatIndex: 0 })
  }

  // Step the beat's duration shorter/longer (TuxGuitar +/-).
  function stepDuration(c: Cursor, longer: boolean) {
    const order = [D.Whole, D.Half, D.Quarter, D.Eighth, D.Sixteenth, D.ThirtySecond, D.SixtyFourth]
    const beat = getBeatAtCursor(c)
    if (!beat) return
    const idx = order.indexOf(beat.duration)
    if (idx === -1) return
    const ni = Math.max(0, Math.min(order.length - 1, idx + (longer ? -1 : 1)))
    if (ni !== idx) setBeatDuration(c, order[ni])
  }

  // Clear a beat's notes (TuxGuitar Ctrl+Del "Clean beat").
  function cleanBeat(c: Cursor) {
    withHistory(() => {
      const beat = getBeatAtCursor(c)
      if (!beat) return
      beat.notes = []
      try { beat.updateDurations(); beat.chain() } catch { /* */ }
    })
  }

  // Cycle the beat fade (TuxGuitar F): None > FadeIn > FadeOut > VolumeSwell.
  function cycleFade(c: Cursor) {
    withHistory(() => {
      const beat = getBeatAtCursor(c)
      if (!beat) return
      beat.fade = (((beat.fade ?? 0) + 1) % 4)
      try { beat.updateDurations(); beat.chain() } catch { /* */ }
    })
  }

  // Move the cursor's note to the string above/below (TuxGuitar Shift+Up/Down), keeping the fret.
  function moveNoteToString(up: boolean) {
    if (!cursor) return
    const c = cursor
    const beat = getBeatAtCursor(c)
    const note = beat?.notes?.find((n: any) => n.string === noteStringFor(c.stringIndex))
    if (!note) return
    const targetIdx = c.stringIndex + (up ? -1 : 1)
    if (targetIdx < 0 || targetIdx >= tabStringCount()) return
    const targetString = noteStringFor(targetIdx)
    if (beat.notes.some((n: any) => n.string === targetString)) return // occupied
    pushHistory()
    note.string = targetString
    try { beat.updateDurations(); beat.chain() } catch { /* */ }
    rerender()
    setCursor({ ...c, stringIndex: targetIdx })
  }

  // Insert an empty (rest) beat after the cursor (TuxGuitar Ins).
  function insertRestBeat(c: Cursor) {
    const voice = scoreRef.current?.tracks[selectedTrack]?.staves[0]?.bars[c.barIndex]?.voices[c.voiceIndex]
    const after = voice?.beats[c.beatIndex]
    if (!voice || !after) return
    const Beat = alphaTab.model?.Beat || (alphaTab as any).Beat
    if (!Beat) return
    pushHistory()
    const nb = new Beat()
    nb.duration = after.duration
    voice.insertBeat(after, nb)
    reimportAndRender() // round-trip finalizes the freshly built beat
  }

  // --- Track & tempo management (TuxGuitar) ---
  function refreshTrackList() {
    const score = scoreRef.current
    if (score) setTracks(score.tracks.map((t: any, i: number) => ({ index: i, name: t.name || `Track ${i + 1}` })))
  }

  function renameTrack(idx: number, name: string) {
    const track = scoreRef.current?.tracks[idx]
    if (!track) return
    track.name = name
    refreshTrackList()
    rerender() // name change is non-structural
  }

  function setTrackProgram(idx: number, program: number) {
    const track = scoreRef.current?.tracks[idx]
    if (!track) return
    pushHistory()
    track.playbackInfo.program = program
    reimportAndRender()
  }

  function setTempo(bpm: number) {
    const score = scoreRef.current
    const mb0 = score?.masterBars[0]
    if (!mb0) return
    pushHistory()
    if (mb0.tempoAutomations.length > 0) {
      mb0.tempoAutomations[0].value = bpm
    } else {
      const Automation = (alphaTab.model as any)?.Automation || (alphaTab as any).Automation
      if (Automation) mb0.tempoAutomations.push(Automation.buildTempoAutomation(false, 0, bpm, 2))
    }
    reimportAndRender()
  }

  function setSectionMarker(barIndex: number, text: string) {
    const mb = scoreRef.current?.masterBars[barIndex]
    if (!mb) return
    pushHistory()
    if (text) {
      const Section = (alphaTab.model as any)?.Section || (alphaTab as any).Section
      const s: any = new Section()
      s.text = text; s.marker = ''
      mb.section = s
    } else {
      mb.section = null
    }
    reimportAndRender()
  }

  function deleteTrack(idx: number) {
    const score = scoreRef.current
    if (!score || score.tracks.length <= 1) return
    pushHistory()
    score.tracks.splice(idx, 1)
    const newIdx = Math.min(idx, score.tracks.length - 1)
    setSelectedTrack(newIdx)
    selectedTrackRef.current = newIdx
    reimportAndRender()
    refreshTrackList()
  }

  function addTrack() {
    const score = scoreRef.current
    if (!score) return
    const M = alphaTab.model as any
    const Track = M?.Track || (alphaTab as any).Track
    const Staff = M?.Staff || (alphaTab as any).Staff
    const Bar = M?.Bar, Voice = M?.Voice, Beat = M?.Beat, Tuning = M?.Tuning
    if (!Track || !Staff || !Bar || !Voice || !Beat || !Tuning) return
    pushHistory()
    const track: any = new Track()
    track.name = `Track ${score.tracks.length + 1}`
    track.playbackInfo.program = 25 // acoustic guitar (steel)
    const staff: any = new Staff()
    staff.stringTuning = new Tuning('Standard', [64, 59, 55, 50, 45, 40], true) // standard 6-string, top→bottom
    staff.showStandardNotation = true
    staff.showTablature = true
    track.addStaff(staff)
    for (let i = 0; i < score.masterBars.length; i++) {
      const bar: any = new Bar()
      const v = new Voice()
      bar.addVoice(v)
      const eb: any = new Beat()
      eb.isEmpty = true
      v.addBeat(eb)
      staff.addBar(bar)
    }
    score.addTrack(track)
    reimportAndRender()
    refreshTrackList()
  }

  // --- Multi-voice ---
  // Ensure a bar has at least vIdx+1 voices (new voices get a full-bar empty/rest beat).
  function ensureVoiceInBar(barIndex: number, vIdx: number): boolean {
    const bar: any = scoreRef.current?.tracks[selectedTrack]?.staves[0]?.bars[barIndex]
    if (!bar || bar.voices.length > vIdx) return false
    const Voice = (alphaTab.model as any)?.Voice || (alphaTab as any).Voice
    const Beat = (alphaTab.model as any)?.Beat || (alphaTab as any).Beat
    while (bar.voices.length <= vIdx) {
      const v = new Voice()
      bar.addVoice(v)
      const eb: any = new Beat()
      eb.isEmpty = true
      v.addBeat(eb)
    }
    return true
  }

  // Switch the active editing voice (TuxGuitar voice 1/2). Creates the voice across the
  // track if needed so navigation/editing works in every bar.
  function selectVoice(v: number) {
    if (v > 0) {
      const bars = scoreRef.current?.tracks[selectedTrack]?.staves[0]?.bars || []
      let changed = false
      for (let bi = 0; bi < bars.length; bi++) if (ensureVoiceInBar(bi, v)) changed = true
      if (changed) reimportAndRender()
    }
    setCursor(c => c ? { ...c, voiceIndex: v, beatIndex: 0 } : { barIndex: 0, voiceIndex: v, beatIndex: 0, stringIndex: 0 })
  }

  // --- Chords ---
  // Build a chord diagram from the current beat's notes and attach it (TuxGuitar chord).
  function setBeatChord(c: Cursor, name: string) {
    const beat: any = getBeatAtCursor(c)
    if (!beat) return
    const staff: any = scoreRef.current?.tracks[selectedTrack]?.staves[0]
    if (!staff) return
    pushHistory()
    if (!name.trim()) {
      beat.chordId = null
      reimportAndRender()
      return
    }
    const Chord = (alphaTab.model as any)?.Chord || (alphaTab as any).Chord
    const ch: any = new Chord()
    ch.name = name
    ch.showName = true; ch.showDiagram = true; ch.showFingering = false
    const n = tabStringCount()
    ch.strings = Array.from({ length: n }, (_, i) => {
      const note = beat.notes?.find((x: any) => x.string === noteStringFor(i)) // i=0 = highest/top string
      return note ? note.fret : -1
    })
    ch.firstFret = 1
    if (!staff.chords) staff.chords = new Map()
    const id = ch.uniqueId || name
    staff.addChord(id, ch)
    beat.chordId = id
    reimportAndRender()
  }

  // --- Measure management (TuxGuitar add/remove measure, time/key signature) ---
  function insertMeasure(afterBarIndex: number) {
    const score = scoreRef.current
    if (!score) return
    const MasterBar = (alphaTab.model as any)?.MasterBar || (alphaTab as any).MasterBar
    const Bar = (alphaTab.model as any)?.Bar || (alphaTab as any).Bar
    const Voice = (alphaTab.model as any)?.Voice || (alphaTab as any).Voice
    const Beat = (alphaTab.model as any)?.Beat || (alphaTab as any).Beat
    if (!MasterBar || !Bar || !Voice || !Beat) return
    pushHistory()
    const at = afterBarIndex + 1
    const ref = score.masterBars[afterBarIndex]
    const mb: any = new MasterBar()
    mb.timeSignatureNumerator = ref?.timeSignatureNumerator ?? 4
    mb.timeSignatureDenominator = ref?.timeSignatureDenominator ?? 4
    score.masterBars.splice(at, 0, mb)
    for (const track of score.tracks) {
      for (const staff of track.staves) {
        const refBar = staff.bars[afterBarIndex]
        const bar: any = new Bar()
        if (refBar) { bar.clef = refBar.clef; bar.clefOttava = refBar.clefOttava }
        const v = new Voice()
        bar.addVoice(v)
        const eb: any = new Beat()
        eb.isEmpty = true
        v.addBeat(eb)
        staff.bars.splice(at, 0, bar)
      }
    }
    reimportAndRender()
  }

  function deleteMeasure(barIndex: number) {
    const score = scoreRef.current
    if (!score || score.masterBars.length <= 1) return // keep at least one measure
    pushHistory()
    score.masterBars.splice(barIndex, 1)
    for (const track of score.tracks) for (const staff of track.staves) staff.bars.splice(barIndex, 1)
    reimportAndRender()
    setCursor(c => c ? { ...c, barIndex: Math.min(c.barIndex, score.masterBars.length - 1), beatIndex: 0 } : c)
  }

  function setTimeSignature(barIndex: number, num: number, den: number) {
    const score = scoreRef.current
    const mb = score?.masterBars[barIndex]
    if (!mb) return
    pushHistory()
    mb.timeSignatureNumerator = num
    mb.timeSignatureDenominator = den
    reimportAndRender()
  }

  function setKeySignature(barIndex: number, key: number) {
    const score = scoreRef.current
    if (!score) return
    pushHistory()
    for (const track of score.tracks) for (const staff of track.staves) {
      const bar: any = staff.bars[barIndex]
      if (bar) bar.keySignature = key
    }
    reimportAndRender()
  }

  // --- Copy / Cut / Paste (beat-level, TuxGuitar Ctrl+C / X / V) ---
  function snapshotBeat(beat: any): BeatSnap {
    return {
      duration: beat.duration,
      dots: beat.dots || 0,
      isRest: !!beat.isRest,
      notes: (beat.notes || []).map((n: any) => ({
        string: n.string, fret: n.fret,
        isGhost: n.isGhost, isDead: n.isDead, isPalmMute: n.isPalmMute,
        isLetRing: n.isLetRing, isStaccato: n.isStaccato,
        vibrato: n.vibrato, accentuated: n.accentuated, harmonicType: n.harmonicType,
      })),
    }
  }

  function buildBeat(snap: BeatSnap): any {
    const Beat = alphaTab.model?.Beat || (alphaTab as any).Beat
    const Note = alphaTab.model?.Note || (alphaTab as any).Note
    const b: any = new Beat()
    b.duration = snap.duration
    b.dots = snap.dots
    b.isEmpty = false // explicit content (isRest is a getter; clear emptiness)
    if (snap.isRest || snap.notes.length === 0) return b // rest: no notes
    for (const ns of snap.notes) {
      const n = new Note()
      n.string = ns.string; n.fret = ns.fret
      if (ns.isGhost) n.isGhost = true
      if (ns.isDead) n.isDead = true
      if (ns.isPalmMute) n.isPalmMute = true
      if (ns.isLetRing) n.isLetRing = true
      if (ns.isStaccato) n.isStaccato = true
      if (ns.vibrato) n.vibrato = ns.vibrato
      if (ns.accentuated) n.accentuated = ns.accentuated
      if (ns.harmonicType) n.harmonicType = ns.harmonicType
      b.addNote(n)
    }
    return b
  }

  function copySelection() {
    const cursors = selectionRange ? selectedBeatCursors() : (cursor ? [cursor] : [])
    const sr = selStringRange() // keep only notes within the selected strings
    const snaps = cursors.map(c => getBeatAtCursor(c)).filter(Boolean).map((b: any) => {
      const snap = snapshotBeat(b)
      if (sr) snap.notes = snap.notes.filter(ns => stringIndexForNote(ns.string) >= sr.min && stringIndexForNote(ns.string) <= sr.max)
      return snap
    })
    if (snaps.length) clipboardRef.current = snaps
  }

  function cutSelection() {
    copySelection()
    if (selectionRange) removeSelection()
    else if (cursor) cleanBeat(cursor)
  }

  function pasteClipboard() {
    if (!cursor || clipboardRef.current.length === 0) return
    const voice = scoreRef.current?.tracks[selectedTrack]?.staves[0]?.bars[cursor.barIndex]?.voices[cursor.voiceIndex]
    let after = voice?.beats[cursor.beatIndex]
    if (!voice || !after) return
    pushHistory()
    for (const snap of clipboardRef.current) {
      const nb = buildBeat(snap)
      voice.insertBeat(after, nb)
      after = nb // chain inserts so order is preserved
    }
    reimportAndRender()
  }

  // Cursor one beat left/right (no state change) — shared by nav and Shift-selection.
  function nextBeatPos(c: Cursor, dir: 'left' | 'right'): Cursor {
    const bars = scoreRef.current?.tracks[selectedTrackRef.current]?.staves[0]?.bars || []
    let { barIndex, voiceIndex, beatIndex } = c
    if (dir === 'left') {
      if (beatIndex > 0) beatIndex--
      else if (barIndex > 0) { barIndex--; beatIndex = Math.max(0, (bars[barIndex]?.voices[voiceIndex]?.beats.length || 1) - 1) }
    } else {
      const beats = bars[barIndex]?.voices[voiceIndex]?.beats || []
      if (beatIndex < beats.length - 1) beatIndex++
      else if (barIndex < bars.length - 1) { barIndex++; beatIndex = 0 }
    }
    return { ...c, barIndex, voiceIndex, beatIndex }
  }

  // Extend the selection from anchor to focus and update the overlay (used by Shift+Arrow / Shift+Click).
  function selectRange(anchor: Cursor, focus: Cursor) {
    setSelectionRange({ start: anchor, end: focus })
    setCursor(focus)
    updateSelectionBounds(anchor, focus)
  }

  function clearSelection() {
    setSelectionRange(null)
    setSelectionBounds([])
  }

  // Compute the selection overlay boxes (one per staff) spanning two cursor positions.
  function updateSelectionBounds(s: Cursor, e: Cursor) {
    const api = getApi()
    const score = scoreRef.current
    if (!api || !score) return
    try {
      const bars = score.tracks[selectedTrackRef.current]?.staves[0]?.bars || []
      const forward = s.barIndex < e.barIndex || (s.barIndex === e.barIndex && s.beatIndex <= e.beatIndex)
      const a = forward ? s : e
      const b = forward ? e : s
      const firstBeat = bars[a.barIndex]?.voices[a.voiceIndex]?.beats[a.beatIndex]
      const lastBeat = bars[b.barIndex]?.voices[b.voiceIndex]?.beats[b.beatIndex]
      if (!firstBeat || !lastBeat) return
      const lookup = (api.renderer.boundsLookup as any)
      const firstAll = lookup?.findBeats(firstBeat) || []
      const lastAll = lookup?.findBeats(lastBeat) || []
      const nStrings = tabStringCount()
      const sMin = Math.min(s.stringIndex, e.stringIndex)
      const sMax = Math.max(s.stringIndex, e.stringIndex)
      const fullStrings = sMin === 0 && sMax === nStrings - 1
      const boxes: { x: number; y: number; w: number; h: number }[] = []
      for (let i = 0; i < Math.min(firstAll.length, lastAll.length); i++) {
        const fvb = firstAll[i]?.visualBounds || firstAll[i]?.realBounds
        const lvb = lastAll[i]?.visualBounds || lastAll[i]?.realBounds
        if (!fvb || !lvb) continue
        const bx = Math.min(fvb.x, lvb.x)
        const bw = Math.max(fvb.x + fvb.w, lvb.x + lvb.w) - bx
        const by = Math.min(fvb.y, lvb.y)
        const bh = Math.max(fvb.y + fvb.h, lvb.y + lvb.h) - by
        if (fullStrings) {
          boxes.push({ x: bx, y: by, w: bw, h: bh })
        } else {
          // Clamp vertically to the selected string lines (individual-note selection)
          const spacing = bh / Math.max(1, nStrings - 1)
          const sh = bh / nStrings
          const top = by + sMin * spacing - sh / 2
          const bottom = by + sMax * spacing + sh / 2
          boxes.push({ x: bx, y: top, w: bw, h: bottom - top })
        }
      }
      setSelectionBounds(boxes)
    } catch { /* */ }
  }

  // --- Find next note on same string (for hammer/pull, slide, tie) ---
  function findNextNoteOnString(c: Cursor) {
    const score = scoreRef.current
    const bars = score?.tracks[selectedTrack]?.staves[0]?.bars || []
    for (let bi = c.barIndex; bi < bars.length; bi++) {
      const voices = bars[bi]?.voices || []
      for (let vi = (bi === c.barIndex ? c.voiceIndex : 0); vi < voices.length; vi++) {
        const beats = voices[vi]?.beats || []
        const startB = (bi === c.barIndex && vi === c.voiceIndex) ? c.beatIndex + 1 : 0
        for (let bj = startB; bj < beats.length; bj++) {
          const note = beats[bj]?.notes?.find((n: any) => n.string === noteStringFor(c.stringIndex))
          if (note) return note
        }
      }
    }
    return null
  }

  // --- Technique mutations ---
  function withHistory(fn: () => void) {
    // During a batch, the caller owns history + rerender (apply-to-selection).
    if (batchingRef.current) { fn(); return }
    pushHistory()
    fn()
    rerender()
  }

  // Cursors for every beat in the current selection (TuxGuitar applies edits to all of them).
  function selectedBeatCursors(): Cursor[] {
    if (!selectionRange) return []
    const { start, end } = selectionRange
    const sBar = Math.min(start.barIndex, end.barIndex)
    const eBar = Math.max(start.barIndex, end.barIndex)
    const sBeat = start.barIndex === end.barIndex ? Math.min(start.beatIndex, end.beatIndex) : (start.barIndex < end.barIndex ? start.beatIndex : end.beatIndex)
    const eBeat = start.barIndex === end.barIndex ? Math.max(start.beatIndex, end.beatIndex) : (start.barIndex < end.barIndex ? end.beatIndex : start.beatIndex)
    const bars = scoreRef.current?.tracks[selectedTrack]?.staves[0]?.bars || []
    const out: Cursor[] = []
    for (let bi = sBar; bi <= eBar; bi++) {
      const bar = bars[bi]
      if (!bar) continue
      const startB = bi === sBar ? sBeat : 0
      const endB = bi === eBar ? eBeat : (bar.voices[start.voiceIndex]?.beats.length || 1) - 1
      for (let bj = startB; bj <= endB; bj++) out.push({ barIndex: bi, voiceIndex: start.voiceIndex, beatIndex: bj, stringIndex: 0 })
    }
    return out
  }

  // The selected string range (individual-note selection). null = whole-beat.
  function selStringRange(): { min: number; max: number } | null {
    if (!selectionRange) return null
    const a = selectionRange.start.stringIndex, b = selectionRange.end.stringIndex
    return { min: Math.min(a, b), max: Math.max(a, b) }
  }

  // Run a set of edits as one undo step + one rerender.
  function batch(run: () => void) {
    pushHistory()
    batchingRef.current = true
    try { run() } finally { batchingRef.current = false }
    rerender()
    if (selectionRange) updateSelectionBounds(selectionRange.start, selectionRange.end)
  }

  // Apply a per-note effect to every selected note (within the selected string range).
  function applyNoteEffectToSelection(fn: (c: Cursor) => void) {
    const sr = selStringRange()
    batch(() => {
      for (const bc of selectedBeatCursors()) {
        const beat = getBeatAtCursor(bc)
        for (const n of beat?.notes || []) {
          const si = stringIndexForNote(n.string)
          if (!sr || (si >= sr.min && si <= sr.max)) fn({ ...bc, stringIndex: si })
        }
      }
    })
  }

  // Apply a per-beat effect to every beat in the selection.
  function applyBeatEffectToSelection(fn: (c: Cursor) => void) {
    batch(() => { for (const bc of selectedBeatCursors()) fn(bc) })
  }

  function setBeatDuration(c: Cursor, dur: number) {
    withHistory(() => {
      const beat = getBeatAtCursor(c)
      if (!beat) return
      beat.duration = dur
      try { beat.updateDurations(); beat.chain() } catch { /* */ }
    })
  }

  function toggleDot(c: Cursor) {
    withHistory(() => {
      const beat = getBeatAtCursor(c)
      if (!beat) return
      beat.dots = beat.dots > 0 ? 0 : 1
      try { beat.updateDurations(); beat.chain() } catch { /* */ }
    })
  }

  function toggleTuplet(c: Cursor) {
    withHistory(() => {
      const beat = getBeatAtCursor(c)
      if (!beat) return
      beat.tupletNumerator = beat.hasTuplet ? 1 : 3
      beat.tupletDenominator = beat.hasTuplet ? 1 : 2
      try { beat.finishTuplet(); beat.updateDurations(); beat.chain() } catch { /* */ }
    })
  }

  function toggleRest(c: Cursor) {
    withHistory(() => {
      const beat = getBeatAtCursor(c)
      if (!beat) return
      // isRest is a getter (= isEmpty || no notes). Toggle via isEmpty/notes instead.
      if (beat.isRest) {
        beat.notes = []
        beat.isEmpty = true // back to empty placeholder (ready for notes)
      } else {
        beat.notes = []
        beat.isEmpty = false // explicit rest
      }
      try { beat.updateDurations(); beat.chain() } catch { /* */ }
    })
  }

  function toggleNoteProp(c: Cursor, prop: string) {
    withHistory(() => {
      const note = getNoteAtCursor(c)
      if (!note) return
      switch (prop) {
        case 'ghost': note.isGhost = !note.isGhost; break
        case 'dead': note.isDead = !note.isDead; break
        case 'palmMute': note.isPalmMute = !note.isPalmMute; break
        case 'letRing': note.isLetRing = !note.isLetRing; break
        case 'staccato': note.isStaccato = !note.isStaccato; break
      }
      const beat = getBeatAtCursor(c)
      try { beat?.updateDurations(); beat?.chain() } catch { /* */ }
    })
  }

  function toggleVibrato(c: Cursor) {
    withHistory(() => {
      const note = getNoteAtCursor(c)
      if (!note) return
      note.vibrato = note.vibrato === V.None ? V.Slight : note.vibrato === V.Slight ? V.Wide : V.None
      const beat = getBeatAtCursor(c)
      try { beat?.updateDurations(); beat?.chain() } catch { /* */ }
    })
  }

  function cycleAccent(c: Cursor) {
    withHistory(() => {
      const note = getNoteAtCursor(c)
      if (!note) return
      note.accentuated = note.accentuated === A.None ? A.Normal : note.accentuated === A.Normal ? A.Heavy : A.None
      const beat = getBeatAtCursor(c)
      try { beat?.updateDurations(); beat?.chain() } catch { /* */ }
    })
  }

  function cycleHarmonic(c: Cursor) {
    withHistory(() => {
      const note = getNoteAtCursor(c)
      if (!note) return
      const types = [H.None, H.Natural, H.Artificial, H.Pinch, H.Tap, H.Semi, H.Feedback]
      const idx = types.indexOf(note.harmonicType)
      note.harmonicType = types[(idx + 1) % types.length]
      const beat = getBeatAtCursor(c)
      try { beat?.updateDurations(); beat?.chain() } catch { /* */ }
    })
  }

  function toggleHammerPull(c: Cursor) {
    withHistory(() => {
      const note = getNoteAtCursor(c)
      if (!note) return
      const next = findNextNoteOnString(c)
      if (!next) return
      if (note.isHammerPullOrigin) {
        note.isHammerPullOrigin = false
        next.hammerPullOrigin = null
      } else {
        note.isHammerPullOrigin = true
        next.hammerPullOrigin = note
      }
      const beat = getBeatAtCursor(c)
      try { beat?.chain(); next.beat?.chain() } catch { /* */ }
    })
  }

  function toggleSlide(c: Cursor) {
    withHistory(() => {
      const note = getNoteAtCursor(c)
      if (!note) return
      const next = findNextNoteOnString(c)
      if (!next) return
      if (note.slideOutType !== SO.None) {
        note.slideOutType = SO.None
        if (next) next.slideInType = SI.None
      } else {
        note.slideOutType = SO.Shift
        if (next) next.slideInType = SI.IntoFromBelow
      }
      const beat = getBeatAtCursor(c)
      try { beat?.chain(); next?.beat?.chain() } catch { /* */ }
    })
  }

  function toggleBend(c: Cursor) {
    withHistory(() => {
      const note = getNoteAtCursor(c)
      if (!note) return
      note.bendType = note.bendType === BT.None ? BT.Bend : BT.None
      const beat = getBeatAtCursor(c)
      try { beat?.updateDurations(); beat?.chain() } catch { /* */ }
    })
  }

  function toggleTie(c: Cursor) {
    withHistory(() => {
      const note = getNoteAtCursor(c)
      if (!note) return
      const next = findNextNoteOnString(c)
      if (!next) return
      if (note.isTieOrigin) {
        note.isTieOrigin = false
        next.tieOrigin = null
      } else {
        note.isTieOrigin = true
        next.tieOrigin = note
      }
      const beat = getBeatAtCursor(c)
      try { beat?.chain(); next?.beat?.chain() } catch { /* */ }
    })
  }

  function toggleTrill(c: Cursor) {
    withHistory(() => {
      const note = getNoteAtCursor(c)
      if (!note) return
      note.trillValue = note.trillValue > 0 ? -1 : (note.fret + 2)
      const beat = getBeatAtCursor(c)
      try { beat?.updateDurations(); beat?.chain() } catch { /* */ }
    })
  }

  function cycleGrace(c: Cursor) {
    withHistory(() => {
      const beat = getBeatAtCursor(c)
      if (!beat) return
      beat.graceType = beat.graceType === GT.None ? GT.BeforeBeat : beat.graceType === GT.BeforeBeat ? GT.OnBeat : GT.None
      try { beat.updateDurations(); beat.chain() } catch { /* */ }
    })
  }

  function cyclePickStroke(c: Cursor) {
    withHistory(() => {
      const beat = getBeatAtCursor(c)
      if (!beat) return
      beat.pickStroke = beat.pickStroke === PS.None ? PS.Up : beat.pickStroke === PS.Up ? PS.Down : PS.None
      try { beat.updateDurations(); beat.chain() } catch { /* */ }
    })
  }

  function toggleTremolo(c: Cursor) {
    withHistory(() => {
      const beat = getBeatAtCursor(c)
      if (!beat) return
      if (beat.tremoloPicking) {
        beat.tremoloPicking = undefined
      } else {
        const TP = ((alphaTab as any).TremoloPickingEffect)
        beat.tremoloPicking = TP ? new TP() : { marks: 1, style: 0 }
      }
      try { beat.updateDurations(); beat.chain() } catch { /* */ }
    })
  }

  function toggleSlap(c: Cursor) {
    withHistory(() => {
      const beat = getBeatAtCursor(c)
      if (!beat) return
      beat.slap = !beat.slap
      try { beat.updateDurations(); beat.chain() } catch { /* */ }
    })
  }

  function togglePop(c: Cursor) {
    withHistory(() => {
      const beat = getBeatAtCursor(c)
      if (!beat) return
      beat.pop = !beat.pop
      try { beat.updateDurations(); beat.chain() } catch { /* */ }
    })
  }

  function setDynamics(c: Cursor, dyn: number) {
    withHistory(() => {
      const beat = getBeatAtCursor(c)
      if (!beat) return
      beat.dynamics = dyn
      try { beat?.updateDurations(); beat?.chain() } catch { /* */ }
    })
  }

  function toggleCrescendo(c: Cursor) {
    withHistory(() => {
      const beat = getBeatAtCursor(c)
      if (!beat) return
      beat.crescendo = beat.crescendo === CT.None ? CT.Crescendo : beat.crescendo === CT.Crescendo ? CT.Decrescendo : CT.None
      try { beat.updateDurations(); beat.chain() } catch { /* */ }
    })
  }

  // --- Actions ---
  const switchTrack = useCallback((index: number) => {
    const api = getApi()
    if (!api) return
    setSelectedTrack(index)
    setCursor(null)
    try {
      const score = scoreRef.current
      if (score) {
        api.renderScore(score, [index])
        const stave = score.tracks[index]?.staves[0]
        if (stave) setStringCount(stave.stringTuning?.tunings?.length || 6)
      }
    } catch { /* */ }
  }, [])

  const handleSave = useCallback(async () => {
    const score = scoreRef.current
    if (!score) return
    setSaving(true)
    setError('')
    try {
      const exporter = new alphaTab.exporter.Gp7Exporter()
      const gp7bytes = exporter.export(score)
      await onSave(gp7bytes, 'modified.gp')
      setError('Saved!')
    } catch (e: any) {
      setError('Save failed: ' + e.message)
    } finally {
      setSaving(false)
    }
  }, [onSave])

  const toggleEditMode = useCallback(() => {
    setEditMode(prev => {
      const next = !prev
      editModeRef.current = next
      if (!next) {
        setCursor(null)
        setFretInput('')
      }
      return next
    })
  }, [])

  // --- Render helpers ---
  const btnBase = "rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 cursor-pointer"
  const btnSm = "rounded-md px-2 py-1 text-xs font-medium transition-all duration-150 cursor-pointer"
  const cursorNote = cursor ? getNoteAtCursor(cursor) : null
  const cursorBeat = cursor ? getBeatAtCursor(cursor) : null
  const bDur = cursorBeat?.duration || null
  const bDots = cursorBeat?.dots || 0
  const bTuplet = cursorBeat?.hasTuplet || false
  const bRest = cursorBeat?.isRest || false

  // Current measure (for the measure controls)
  const curBarIdx = cursor?.barIndex ?? 0
  const curMaster: any = scoreRef.current?.masterBars?.[curBarIdx]
  const tsNum = curMaster?.timeSignatureNumerator ?? 4
  const tsDen = curMaster?.timeSignatureDenominator ?? 4
  const curKey = (scoreRef.current?.tracks[selectedTrack]?.staves[0]?.bars[curBarIdx] as any)?.keySignature ?? 0
  const keyLabel = (k: number) => k === 0 ? 'C / Am' : `${k > 0 ? k + '♯' : -k + '♭'}`

  // Track & tempo (for the track controls)
  const curTrack: any = scoreRef.current?.tracks[selectedTrack]
  const trackProgram = curTrack?.playbackInfo?.program ?? 0
  const songTempo = scoreRef.current?.tempo ?? 120
  const curSection = curMaster?.section?.text ?? ''
  const curVoice = cursor?.voiceIndex ?? 0
  const curChordName = (cursorBeat as any)?.chord?.name ?? ''
  const PROGRAMS = [
    { v: 24, n: 'Nylon Guitar' }, { v: 25, n: 'Steel Guitar' }, { v: 26, n: 'Jazz Guitar' },
    { v: 27, n: 'Clean Guitar' }, { v: 29, n: 'Overdrive Gt.' }, { v: 30, n: 'Distortion Gt.' },
    { v: 33, n: 'Acoustic Bass' }, { v: 34, n: 'Finger Bass' }, { v: 35, n: 'Pick Bass' },
    { v: 0, n: 'Piano' }, { v: 48, n: 'Strings' }, { v: 56, n: 'Trumpet' },
  ]

  const durLabels = [
    { label: '\uD834\uDD5D', val: D.Whole },
    { label: '\uD834\uDD5E', val: D.Half },
    { label: '\u2669', val: D.Quarter },
    { label: '\u266A', val: D.Eighth },
    { label: '\u266B', val: D.Sixteenth },
    { label: '\u266C', val: D.ThirtySecond },
  ]

  if (error && !loaded) {
    return <div className="rounded-xl border border-danger/20 bg-danger/10 p-4 text-sm text-danger">{error}</div>
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-bg-card p-3">
        <select
          value={selectedTrack}
          onChange={e => switchTrack(Number(e.target.value))}
          className="rounded-lg border border-border bg-bg-input px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50 cursor-pointer"
        >
          {tracks.map(t => (
            <option key={t.index} value={t.index}>{t.name}</option>
          ))}
        </select>

        <div className="w-px h-6 bg-border" />

        <button
          onClick={toggleEditMode}
          className={`${btnBase} ${editMode ? 'bg-cta-soft text-cta' : 'text-text-secondary hover:text-text-primary hover:bg-bg-input'}`}
        >
          {editMode ? 'Editing' : 'Edit'}
        </button>

        <div className="flex-1" />

        <button
          onClick={handleSave} disabled={saving}
          className={`rounded-lg px-5 py-1.5 text-sm font-medium transition-all duration-200 cursor-pointer shadow-lg shadow-cta-glow ${saving ? 'bg-cta/50 text-white/50' : 'bg-cta text-white hover:bg-cta-hover'}`}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Edit panel */}
      {editMode && (
        <div className="rounded-xl border border-cta/30 bg-bg-card p-3 space-y-3">
          {/* Keyboard hints */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
            <span className="text-text-secondary">Click tab to place cursor</span>
            <span className="text-text-muted">&rarr;</span>
            <kbd className="px-1.5 py-0.5 rounded bg-bg-input border border-border text-text-primary font-mono text-[10px]">0-9</kbd>
            <span className="text-text-secondary">type fret (live)</span>
            <span className="text-text-muted">&middot;</span>
            <kbd className="px-1.5 py-0.5 rounded bg-bg-input border border-border text-text-primary font-mono text-[10px]">Del</kbd>
            <span className="text-text-secondary">remove</span>
            <span className="text-text-muted">&middot;</span>
            <kbd className="px-1.5 py-0.5 rounded bg-bg-input border border-border text-text-primary font-mono text-[10px]">&#8592;&#8593;&#8595;&#8594;</kbd>
            <span className="text-text-secondary">navigate</span>
            <span className="text-text-muted">&middot;</span>
            <kbd className="px-1.5 py-0.5 rounded bg-bg-input border border-border text-text-primary font-mono text-[10px]">Z</kbd>
            <span className="text-text-secondary">undo</span>
          </div>
          {/* TuxGuitar-style shortcuts */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-text-muted border-t border-border/50 pt-2">
            <span><kbd className="font-mono text-text-secondary">H</kbd> hammer</span>
            <span><kbd className="font-mono text-text-secondary">S</kbd> slide</span>
            <span><kbd className="font-mono text-text-secondary">B</kbd> bend</span>
            <span><kbd className="font-mono text-text-secondary">V</kbd> vibrato</span>
            <span><kbd className="font-mono text-text-secondary">L</kbd> tie</span>
            <span><kbd className="font-mono text-text-secondary">P</kbd> palm mute</span>
            <span><kbd className="font-mono text-text-secondary">X</kbd> dead</span>
            <span><kbd className="font-mono text-text-secondary">O</kbd> ghost</span>
            <span><kbd className="font-mono text-text-secondary">G</kbd> grace</span>
            <span><kbd className="font-mono text-text-secondary">F</kbd> fade</span>
            <span><kbd className="font-mono text-text-secondary">+/-</kbd> duration</span>
            <span><kbd className="font-mono text-text-secondary">*</kbd> dot</span>
            <span><kbd className="font-mono text-text-secondary">/</kbd> triplet</span>
            <span><kbd className="font-mono text-text-secondary">Ctrl+&#8592;/&#8594;</kbd> measure</span>
            <span><kbd className="font-mono text-text-secondary">Shift+&#8592;/&#8594;</kbd> select</span>
            <span><kbd className="font-mono text-text-secondary">Shift+&#8593;/&#8595;</kbd> move string</span>
            <span><kbd className="font-mono text-text-secondary">Ins</kbd> insert beat</span>
            <span><kbd className="font-mono text-text-secondary">Ctrl+Del</kbd> clean beat</span>
            <span><kbd className="font-mono text-text-secondary">Ctrl+C/X/V</kbd> copy/cut/paste</span>
          </div>

          {/* Track & tempo controls */}
          <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-2">
            <span className="text-text-muted text-xs mr-1">Track:</span>
            <input
              key={selectedTrack}
              defaultValue={curTrack?.name ?? ''}
              onBlur={e => renameTrack(selectedTrack, e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              placeholder="name"
              className="rounded-md border border-border bg-bg-input px-2 py-1 text-xs text-text-primary w-28 focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
            <button onClick={addTrack} className={`${btnSm} border border-border bg-bg-input text-text-secondary hover:border-cta/50`} title="Add track">+ Track</button>
            <button onClick={() => deleteTrack(selectedTrack)} className={`${btnSm} border border-border bg-bg-input text-text-secondary hover:border-danger/50`} title="Delete this track">&minus; Track</button>
            <div className="w-px h-6 bg-border" />
            <span className="text-text-muted text-xs">Inst.</span>
            <select value={trackProgram} onChange={e => setTrackProgram(selectedTrack, Number(e.target.value))}
              className="rounded-md border border-border bg-bg-input px-1.5 py-1 text-xs text-text-primary cursor-pointer">
              {PROGRAMS.every(p => p.v !== trackProgram) && <option value={trackProgram}>Program {trackProgram}</option>}
              {PROGRAMS.map(p => <option key={p.v} value={p.v}>{p.n}</option>)}
            </select>
            <div className="w-px h-6 bg-border" />
            <span className="text-text-muted text-xs">Tempo</span>
            <input
              key={`tempo-${songTempo}`}
              type="number" min={20} max={400} defaultValue={songTempo}
              onBlur={e => { const v = Number(e.target.value); if (v >= 20 && v <= 400 && v !== songTempo) setTempo(v) }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              className="rounded-md border border-border bg-bg-input px-1.5 py-1 text-xs text-text-primary w-16 focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
            <span className="text-text-muted text-xs">bpm</span>
            <div className="w-px h-6 bg-border" />
            <span className="text-text-muted text-xs">Marker</span>
            <input
              key={`sec-${curBarIdx}-${curSection}`}
              defaultValue={curSection}
              onBlur={e => setSectionMarker(curBarIdx, e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              placeholder="section"
              className="rounded-md border border-border bg-bg-input px-2 py-1 text-xs text-text-primary w-24 focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
          </div>

          {/* Duration controls */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-text-muted text-xs mr-1">Duration:</span>
            {durLabels.map(d => (
              <button key={d.val} onClick={() => cursor && setBeatDuration(cursor, d.val)}
                className={`${btnSm} border ${bDur === d.val ? 'border-accent bg-accent/20 text-accent' : 'border-border bg-bg-input text-text-secondary hover:border-accent/50'}`}
                title={Object.keys(D).find(k => D[k as keyof typeof D] === d.val)}>
                {d.label}
              </button>
            ))}
            <div className="w-px h-6 bg-border" />
            <button onClick={() => cursor && toggleDot(cursor)}
              className={`${btnSm} border ${bDots > 0 ? 'border-accent bg-accent/20 text-accent' : 'border-border bg-bg-input text-text-secondary hover:border-accent/50'}`}
              title="Dotted">&middot; Dot</button>
            <button onClick={() => cursor && toggleTuplet(cursor)}
              className={`${btnSm} border ${bTuplet ? 'border-cta bg-cta/20 text-cta' : 'border-border bg-bg-input text-text-secondary hover:border-accent/50'}`}
              title="Triplet">3 Triplet</button>
            <button onClick={() => cursor && toggleRest(cursor)}
              className={`${btnSm} border ${bRest ? 'border-danger bg-danger/10 text-danger' : 'border-border bg-bg-input text-text-secondary hover:border-accent/50'}`}
              title="Rest">Rest</button>
            <div className="w-px h-6 bg-border" />
            <span className="text-text-muted text-xs">Voice:</span>
            <button onClick={() => selectVoice(0)}
              className={`${btnSm} border ${curVoice === 0 ? 'border-cta bg-cta/20 text-cta' : 'border-border bg-bg-input text-text-secondary hover:border-accent/50'}`}>1</button>
            <button onClick={() => selectVoice(1)}
              className={`${btnSm} border ${curVoice === 1 ? 'border-cta bg-cta/20 text-cta' : 'border-border bg-bg-input text-text-secondary hover:border-accent/50'}`}>2</button>
            <div className="w-px h-6 bg-border" />
            <span className="text-text-muted text-xs">Chord:</span>
            <input
              key={`chord-${cursor?.barIndex}-${cursor?.beatIndex}-${curChordName}`}
              defaultValue={curChordName}
              onBlur={e => cursor && setBeatChord(cursor, e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              placeholder="e.g. Am"
              disabled={!cursor}
              className="rounded-md border border-border bg-bg-input px-2 py-1 text-xs text-text-primary w-20 focus:outline-none focus:ring-1 focus:ring-accent/50 disabled:opacity-40"
            />
          </div>

          {/* Measure controls */}
          <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-2">
            <span className="text-text-muted text-xs mr-1">Measure {curBarIdx + 1}:</span>
            <button onClick={() => insertMeasure(curBarIdx)}
              className={`${btnSm} border border-border bg-bg-input text-text-secondary hover:border-cta/50`} title="Insert empty measure after this one">+ Insert</button>
            <button onClick={() => deleteMeasure(curBarIdx)}
              className={`${btnSm} border border-border bg-bg-input text-text-secondary hover:border-danger/50`} title="Delete this measure">&minus; Delete</button>
            <div className="w-px h-6 bg-border" />
            <span className="text-text-muted text-xs">Time</span>
            <select value={tsNum} onChange={e => setTimeSignature(curBarIdx, Number(e.target.value), tsDen)}
              className="rounded-md border border-border bg-bg-input px-1.5 py-1 text-xs text-text-primary cursor-pointer">
              {Array.from({ length: 16 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="text-text-muted">/</span>
            <select value={tsDen} onChange={e => setTimeSignature(curBarIdx, tsNum, Number(e.target.value))}
              className="rounded-md border border-border bg-bg-input px-1.5 py-1 text-xs text-text-primary cursor-pointer">
              {[1, 2, 4, 8, 16, 32].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <div className="w-px h-6 bg-border" />
            <span className="text-text-muted text-xs">Key</span>
            <select value={curKey} onChange={e => setKeySignature(curBarIdx, Number(e.target.value))}
              className="rounded-md border border-border bg-bg-input px-1.5 py-1 text-xs text-text-primary cursor-pointer">
              {Array.from({ length: 15 }, (_, i) => i - 7).map(k => <option key={k} value={k}>{keyLabel(k)}</option>)}
            </select>
          </div>

          {/* Technique toggles */}
          {cursor && (
            <div className="space-y-2">
              {/* Cursor info */}
              <div className="flex flex-wrap items-center gap-3 text-sm font-medium">
                <div className="flex items-center gap-1.5">
                  <span className="text-text-muted text-xs">Bar</span>
                  <span className="text-text-primary font-bold tabular-nums">{cursor.barIndex + 1}</span>
                </div>
                <span className="text-border">&middot;</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-text-muted text-xs">Beat</span>
                  <span className="text-text-primary font-bold tabular-nums">{cursor.beatIndex + 1}</span>
                  {bDur && <span className="text-text-muted text-xs">({Object.keys(D).find(k => D[k as keyof typeof D] === bDur)?.replace('ThirtySecond','32nd').replace('Sixteenth','16th').replace('Eighth','8th').replace('Quarter','4th').replace('Half','1/2').replace('Whole','1') || bDur})</span>}
                </div>
                <span className="text-border">&middot;</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-text-muted text-xs">String</span>
                  <span className="text-text-primary font-bold tabular-nums">{cursor.stringIndex + 1}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {cursorNote ? (
                  <span className="px-3 py-1 rounded-lg bg-accent text-white font-mono font-bold text-lg tabular-nums shadow-lg shadow-accent-glow/30">
                    {cursorNote.fret}
                  </span>
                ) : fretInput ? (
                  <span className="px-3 py-1 rounded-lg bg-cta text-white font-mono font-bold text-lg tabular-nums animate-pulse shadow-lg shadow-cta-glow/30">
                    {fretInput}
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-lg bg-bg-input border border-border text-text-muted italic text-sm">
                    type fret number
                  </span>
                )}
                {cursorNote && fretInput && (
                  <>
                    <span className="text-text-muted text-xs">&rarr;</span>
                    <span className="px-2 py-1 rounded-lg bg-cta-soft text-cta font-mono font-bold text-sm animate-pulse">
                      {fretInput}
                    </span>
                  </>
                )}
              </div>

              {/* Note technique grid */}
              <div className="flex flex-wrap gap-1.5 border-t border-border/50 pt-2">
                <span className="text-text-muted text-[10px] mr-1 self-center">Articulation:</span>
                <button onClick={() => cursor && toggleHammerPull(cursor)}
                  className={`${btnSm} border ${cursorNote?.isHammerPullOrigin ? 'border-cta bg-cta/20 text-cta' : 'border-border bg-bg-input text-text-secondary hover:border-accent/50'}`}>
                  H-O/P-O
                </button>
                <button onClick={() => cursor && toggleSlide(cursor)}
                  className={`${btnSm} border ${cursorNote?.slideOutType !== SO.None ? 'border-cta bg-cta/20 text-cta' : 'border-border bg-bg-input text-text-secondary hover:border-accent/50'}`}>
                  Slide
                </button>
                <button onClick={() => cursor && toggleBend(cursor)}
                  className={`${btnSm} border ${cursorNote?.bendType !== BT.None ? 'border-cta bg-cta/20 text-cta' : 'border-border bg-bg-input text-text-secondary hover:border-accent/50'}`}>
                  Bend
                </button>
                <button onClick={() => cursor && toggleTie(cursor)}
                  className={`${btnSm} border ${cursorNote?.isTieOrigin ? 'border-cta bg-cta/20 text-cta' : 'border-border bg-bg-input text-text-secondary hover:border-accent/50'}`}>
                  Tie
                </button>
                <button onClick={() => cursor && toggleVibrato(cursor)}
                  className={`${btnSm} border ${cursorNote?.vibrato !== V.None ? 'border-cta bg-cta/20 text-cta' : 'border-border bg-bg-input text-text-secondary hover:border-accent/50'}`}>
                  Vib {cursorNote?.vibrato === V.Wide ? '(w)' : cursorNote?.vibrato === V.Slight ? '(s)' : ''}
                </button>
                <span className="text-border/30 self-center text-[10px]">|</span>
                <button onClick={() => cursor && toggleNoteProp(cursor, 'palmMute')}
                  className={`${btnSm} border ${cursorNote?.isPalmMute ? 'border-accent bg-accent/20 text-accent' : 'border-border bg-bg-input text-text-secondary hover:border-accent/50'}`}>
                  P.M.
                </button>
                <button onClick={() => cursor && toggleNoteProp(cursor, 'dead')}
                  className={`${btnSm} border ${cursorNote?.isDead ? 'border-accent bg-accent/20 text-accent' : 'border-border bg-bg-input text-text-secondary hover:border-accent/50'}`}>
                  Dead
                </button>
                <button onClick={() => cursor && toggleNoteProp(cursor, 'ghost')}
                  className={`${btnSm} border ${cursorNote?.isGhost ? 'border-accent bg-accent/20 text-accent' : 'border-border bg-bg-input text-text-secondary hover:border-accent/50'}`}>
                  Ghost
                </button>
                <span className="text-border/30 self-center text-[10px]">|</span>
                <button onClick={() => cursor && cycleHarmonic(cursor)}
                  className={`${btnSm} border ${cursorNote?.harmonicType !== H.None ? 'border-accent bg-accent/20 text-accent' : 'border-border bg-bg-input text-text-secondary hover:border-accent/50'}`}
                  title="Natural > Artificial > Pinch > Tap > Semi > Feedback > Off">
                  Harm. {cursorNote?.harmonicType ? ['','Nat','Art','Pinch','Tap','Semi','Fb'][cursorNote.harmonicType] : ''}
                </button>
                <button onClick={() => cursor && toggleNoteProp(cursor, 'letRing')}
                  className={`${btnSm} border ${cursorNote?.isLetRing ? 'border-accent bg-accent/20 text-accent' : 'border-border bg-bg-input text-text-secondary hover:border-accent/50'}`}>
                  L.R.
                </button>
                <button onClick={() => cursor && toggleNoteProp(cursor, 'staccato')}
                  className={`${btnSm} border ${cursorNote?.isStaccato ? 'border-accent bg-accent/20 text-accent' : 'border-border bg-bg-input text-text-secondary hover:border-accent/50'}`}>
                  Stac.
                </button>
                <button onClick={() => cursor && cycleAccent(cursor)}
                  className={`${btnSm} border ${cursorNote?.accentuated !== A.None ? 'border-accent bg-accent/20 text-accent' : 'border-border bg-bg-input text-text-secondary hover:border-accent/50'}`}>
                  Accent {cursorNote?.accentuated === A.Normal ? '(n)' : cursorNote?.accentuated === A.Heavy ? '(h)' : ''}
                </button>
                <button onClick={() => cursor && toggleTrill(cursor)}
                  className={`${btnSm} border ${cursorNote?.trillValue > 0 ? 'border-accent bg-accent/20 text-accent' : 'border-border bg-bg-input text-text-secondary hover:border-accent/50'}`}>
                  Trill
                </button>
              </div>

              {/* Beat technique grid */}
              <div className="flex flex-wrap gap-1.5 border-t border-border/50 pt-2">
                <span className="text-text-muted text-[10px] mr-1 self-center">Beat:</span>
                <button onClick={() => cursor && cycleGrace(cursor)}
                  className={`${btnSm} border ${cursorBeat?.graceType !== GT.None ? 'border-cta bg-cta/20 text-cta' : 'border-border bg-bg-input text-text-secondary hover:border-accent/50'}`}>
                  Grace {cursorBeat?.graceType === GT.BeforeBeat ? '(b)' : cursorBeat?.graceType === GT.OnBeat ? '(o)' : ''}
                </button>
                <button onClick={() => cursor && cyclePickStroke(cursor)}
                  className={`${btnSm} border ${cursorBeat?.pickStroke !== PS.None ? 'border-cta bg-cta/20 text-cta' : 'border-border bg-bg-input text-text-secondary hover:border-accent/50'}`}>
                  Pick {cursorBeat?.pickStroke === PS.Up ? '^^' : cursorBeat?.pickStroke === PS.Down ? 'vv' : ''}
                </button>
                <button onClick={() => cursor && toggleTremolo(cursor)}
                  className={`${btnSm} border ${cursorBeat?.tremoloPicking ? 'border-cta bg-cta/20 text-cta' : 'border-border bg-bg-input text-text-secondary hover:border-accent/50'}`}>
                  Trem.
                </button>
                <button onClick={() => cursor && toggleSlap(cursor)}
                  className={`${btnSm} border ${cursorBeat?.slap ? 'border-cta bg-cta/20 text-cta' : 'border-border bg-bg-input text-text-secondary hover:border-accent/50'}`}>
                  Slap
                </button>
                <button onClick={() => cursor && togglePop(cursor)}
                  className={`${btnSm} border ${cursorBeat?.pop ? 'border-cta bg-cta/20 text-cta' : 'border-border bg-bg-input text-text-secondary hover:border-accent/50'}`}>
                  Pop
                </button>
                <button onClick={() => cursor && toggleCrescendo(cursor)}
                  className={`${btnSm} border ${cursorBeat?.crescendo !== CT.None ? 'border-cta bg-cta/20 text-cta' : 'border-border bg-bg-input text-text-secondary hover:border-accent/50'}`}>
                  {cursorBeat?.crescendo === CT.Crescendo ? 'Cresc.' : cursorBeat?.crescendo === CT.Decrescendo ? 'Dim.' : 'Cresc.'}
                </button>
              </div>

              {/* Dynamics */}
              <div className="flex flex-wrap gap-1 border-t border-border/50 pt-2">
                <span className="text-text-muted text-[10px] mr-1 self-center">Dyn:</span>
                {[
                  { label: 'ppp', val: DYN.PPP }, { label: 'pp', val: DYN.PP }, { label: 'p', val: DYN.P },
                  { label: 'mp', val: DYN.MP }, { label: 'mf', val: DYN.MF }, { label: 'f', val: DYN.F },
                  { label: 'ff', val: DYN.FF }, { label: 'fff', val: DYN.FFF },
                ].map(d => (
                  <button key={d.val} onClick={() => cursor && setDynamics(cursor, d.val)}
                    className={`${btnSm} border ${cursorBeat?.dynamics === d.val ? 'border-accent bg-accent/20 text-accent' : 'border-border bg-bg-input text-text-secondary hover:border-accent/50'}`}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Status banners */}
      {error && loaded && (
        <p className={`rounded-lg p-3 text-sm font-medium ${
          error === 'Saved!' ? 'border border-cta/30 bg-cta-soft text-cta' : 'border border-danger/20 bg-danger/10 text-danger'
        }`}>
          {error}
        </p>
      )}

      {/* Visual sheet */}
      <div className="relative">
        {(selectionBounds || []).map((s, i) => (
          <div
            key={i}
            className="absolute pointer-events-none z-20 rounded-sm transition-all duration-100"
            style={{
              left: s.x - 4,
              top: s.y - 4,
              width: s.w + 8,
              height: s.h + 8,
              boxShadow: '0 0 0 2px rgba(34,197,94,0.7), 0 0 20px rgba(34,197,94,0.25)',
              background: 'rgba(34,197,94,0.06)',
            }}
          />
        ))}
        {(selectionBounds?.length ?? 0) === 0 && noteHighlights.map((h, i) => (
          <div
            key={i}
            className="absolute pointer-events-none z-10 transition-all duration-150 rounded"
            style={{
              left: h.x - 2,
              top: h.y - 2,
              width: (h.w || 12) + 4,
              height: (h.h || 12) + 4,
              boxShadow: '0 0 0 2px rgba(67,56,202,0.6), 0 0 12px rgba(67,56,202,0.3)',
              background: 'rgba(67,56,202,0.08)',
            }}
          />
        ))}
        {(selectionBounds?.length ?? 0) === 0 && noteHighlights.length === 0 && barHighlight && (
          <div
            className="absolute pointer-events-none z-10 transition-all duration-150 rounded"
            style={{
              left: barHighlight.x - 2,
              top: barHighlight.y - 2,
              width: (barHighlight.w || 24) + 4,
              height: (barHighlight.h || 16) + 4,
              boxShadow: '0 0 0 2px rgba(67,56,202,0.6), 0 0 12px rgba(67,56,202,0.3)',
              background: 'rgba(67,56,202,0.08)',
            }}
          />
        )}
        <div
          className={`overflow-x-auto rounded-xl border shadow-xl bg-white ${editMode ? 'border-cta/40 ring-2 ring-cta/20 cursor-crosshair' : 'border-border'}`}
          style={{ colorScheme: 'only light' }}
        >
          <div ref={containerRef} className="at-wrap" style={{ colorScheme: 'only light' }} />
        </div>
      </div>
    </div>
  )
}

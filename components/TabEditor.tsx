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

const FRET_TABLE = {
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
}

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
  const [cursor, setCursor] = useState<Cursor | null>(null)
  const [fretInput, setFretInput] = useState<string>('')
  const [stringCount, setStringCount] = useState(6)
  const [barHighlight, setBarHighlight] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [selectionBounds, setSelectionBounds] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [selectionRange, setSelectionRange] = useState<{ start: Cursor; end: Cursor } | null>(null)

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

      // ponytail: helper to compute selection overlay bounds from start/end cursors
      function updateSelectionBounds(s: Cursor, e: Cursor) {
        const score = scoreRef.current
        if (!score) return
        try {
          const track = score.tracks[selectedTrackRef.current]
          if (!track) return
          const bars = track.staves[0]?.bars || []

          // Normalize order
          const sBar = s.barIndex, eBar = e.barIndex
          const sBeat = s.barIndex === e.barIndex ? s.beatIndex : -1
          const eBeat = e.barIndex === s.barIndex ? e.beatIndex : -1

          let firstBeat: any = null, lastBeat: any = null

          if (sBar < eBar || (sBar === eBar && s.beatIndex <= e.beatIndex)) {
            firstBeat = bars[sBar]?.voices[s.voiceIndex]?.beats[s.beatIndex]
            lastBeat = bars[eBar]?.voices[e.voiceIndex]?.beats[e.beatIndex]
          } else {
            firstBeat = bars[eBar]?.voices[e.voiceIndex]?.beats[e.beatIndex]
            lastBeat = bars[sBar]?.voices[s.voiceIndex]?.beats[s.beatIndex]
          }

          if (!firstBeat || !lastBeat) return

          const fb = (api.renderer.boundsLookup as any)?.findBeat(firstBeat)
          const lb = (api.renderer.boundsLookup as any)?.findBeat(lastBeat)
          const fvb = fb?.visualBounds || fb?.realBounds
          const lvb = lb?.visualBounds || lb?.realBounds
          if (!fvb || !lvb) return

          setSelectionBounds({
            x: Math.min(fvb.x, lvb.x),
            y: Math.min(fvb.y, lvb.y),
            w: Math.max(fvb.x + fvb.w, lvb.x + lvb.w) - Math.min(fvb.x, lvb.x),
            h: Math.max(fvb.y + fvb.h, lvb.y + lvb.h) - Math.min(fvb.y, lvb.y),
          })
        } catch { /* */ }
      }

      function restoreCursorHighlight(cur: Cursor) {
        const score = scoreRef.current
        if (!score) return
        const cBeat = score.tracks[selectedTrackRef.current]?.staves[0]?.bars[cur.barIndex]?.voices[cur.voiceIndex]?.beats[cur.beatIndex]
        if (cBeat) {
          const b = (api.renderer.boundsLookup as any)?.findBeat(cBeat)
          const vb = b?.visualBounds || b?.realBounds
          if (vb) {
            let hb = null
            if (b.notes) {
              for (const nb of b.notes) {
                if (nb.note?.string === cur.stringIndex) {
                  hb = nb.noteHeadBounds
                  break
                }
              }
            }
            if (hb) {
              setBarHighlight({ x: hb.x, y: hb.y, w: hb.w, h: hb.h })
            } else {
              const sh = vb.h / (stringCount || 6)
              setBarHighlight({ x: vb.x, y: vb.y + cur.stringIndex * sh, w: vb.w, h: sh })
            }
          }
        } else {
          setBarHighlight(null)
        }
      }

      api.beatMouseDown.on((beat: any) => {
        if (!editModeRef.current) return
        if (!beat) return
        try {
          const pos = findBeatPosition(beat, selectedTrackRef.current)
          if (!pos) return
          selectionStartRef.current = pos
          isDraggingRef.current = true
          setCursor(pos)
          setSelectionRange(null)
          setSelectionBounds(null)
          setFretInput('')
        } catch { /* */ }
      })
      api.noteMouseDown.on((note: any) => {
        if (!editModeRef.current) return
        try {
          if (!note?.beat) return
          const pos = findBeatPosition(note.beat, selectedTrackRef.current)
          if (!pos) return
          pos.stringIndex = note.string
          selectionStartRef.current = pos
          isDraggingRef.current = true
          setCursor(pos)
          setSelectionRange(null)
          setSelectionBounds(null)
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
              setBarHighlight({ x: vb.x, y: vb.y, w: vb.w, h: vb.h })
            }
          }

          // Drag selection
          if (isDraggingRef.current && selectionStartRef.current) {
            const pos = findBeatPosition(beat, selectedTrackRef.current)
            if (!pos) return
            const start = selectionStartRef.current

            // Check if we moved far enough (different beat)
            if (pos.barIndex === start.barIndex && pos.beatIndex === start.beatIndex && pos.voiceIndex === start.voiceIndex) return

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
      setSelectionBounds(null)
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
      setSelectionBounds(null)
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

      // Try to find note bounds for the cursor's string
      let highlightBounds = null
      if (beatBounds.notes) {
        for (const nb of beatBounds.notes) {
          if (nb.note?.string === cursor.stringIndex) {
            highlightBounds = nb.noteHeadBounds
            break
          }
        }
      }

      if (highlightBounds) {
        // Highlight the specific note
        setBarHighlight({
          x: highlightBounds.x,
          y: highlightBounds.y,
          w: highlightBounds.w,
          h: highlightBounds.h,
        })
      } else {
        // No note at cursor — highlight a small area at the beat on that string
        const stringCountVal = stringCount || 6
        const stringHeight = vb.h / stringCountVal
        setBarHighlight({
          x: vb.x,
          y: vb.y + cursor.stringIndex * stringHeight,
          w: vb.w,
          h: stringHeight,
        })
      }

      // Scroll to center
      const containerHeight = atWrap.clientHeight || 500
      const scrollY = highlightBounds?.y ?? vb.y
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
    return beat.notes?.find((n: any) => n.string === c.stringIndex) || null
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

      // Backspace / Delete with selection: bulk delete
      if (selectionRange && (e.key === 'Backspace' || e.key === 'Delete')) {
        e.preventDefault()
        removeSelection()
        return
      }

      if (!cursor) return

      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        if (fretInput) {
          setFretInput(fretInput.slice(0, -1))
        } else if (cursor) {
          removeNoteAtCursor(cursor)
        }
        return
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault()
        applyFretToCursor(fretInput)
        setFretInput('')
        moveCursor(e.key as 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editMode, cursor, fretInput, selectionRange])

  // --- Mutations ---

  function applyFretToCursor(fretStr: string) {
    if (!cursor || !fretStr) return
    pushHistory()
    const fret = parseInt(fretStr, 10)
    if (isNaN(fret)) return

    const beat = getBeatAtCursor(cursor)
    if (!beat) return

    const existing = beat.notes?.find((n: any) => n.string === cursor.stringIndex)
    if (existing) {
      existing.fret = fret
    } else {
      const Note = alphaTab.model?.Note || (alphaTab as any).Note
      if (!Note) return
      const note = new Note()
      note.string = cursor.stringIndex
      note.fret = fret
      beat.addNote(note)
      try { beat.finish({ core: {}, display: {}, notation: {}, player: {}, importer: {} }) } catch { /* */ }
    }

    try { beat.updateDurations() } catch { /* */ }
    try { beat.chain() } catch { /* */ }
    rerender()
  }

  function removeNoteAtCursor(c: Cursor) {
    if (!c) return
    pushHistory()
    const beat = getBeatAtCursor(c)
    if (!beat || !beat.notes) return

    // ponytail: direct splice — more reliable than beat.removeNote
    const idx = beat.notes.findIndex((n: any) => n.string === c.stringIndex)
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

    for (let bi = sBar; bi <= eBar; bi++) {
      const bar = bars[bi]
      if (!bar) continue
      const startB = bi === sBar ? sBeat : 0
      const endB = bi === eBar ? eBeat : (bar.voices[0]?.beats.length || 1) - 1
      for (const voice of bar.voices) {
        for (let bj = startB; bj <= endB; bj++) {
          const beat = voice.beats[bj]
          if (!beat) continue
          // Remove all notes on start/end strings via splice
          if (beat.notes) {
            beat.notes = beat.notes.filter((n: any) =>
              n.string < Math.min(start.stringIndex, end.stringIndex) ||
              n.string > Math.max(start.stringIndex, end.stringIndex)
            )
          }
          try { beat.updateDurations() } catch { /* */ }
          try { beat.chain() } catch { /* */ }
        }
      }
    }

    setSelectionRange(null)
    setSelectionBounds(null)
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
  const cursorNote = cursor ? getNoteAtCursor(cursor) : null

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
        <div className="rounded-xl border border-cta/30 bg-bg-card p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
              <span className="text-text-secondary">Click tab to place cursor</span>
              <span className="text-text-muted">&rarr;</span>
              <kbd className="px-1.5 py-0.5 rounded bg-bg-input border border-border text-text-primary font-mono text-[10px]">0-9</kbd>
              <span className="text-text-secondary">fret</span>
              <span className="text-text-muted">&rarr;</span>
              <kbd className="px-1.5 py-0.5 rounded bg-bg-input border border-border text-text-primary font-mono text-[10px]">Enter</kbd>
              <span className="text-text-secondary">apply</span>
              <span className="text-text-muted">&middot;</span>
              <kbd className="px-1.5 py-0.5 rounded bg-bg-input border border-border text-text-primary font-mono text-[10px]">Del</kbd>
              <span className="text-text-secondary">remove</span>
              <span className="text-text-muted">&middot;</span>
              <kbd className="px-1.5 py-0.5 rounded bg-bg-input border border-border text-text-primary font-mono text-[10px]">&#8592;&#8593;&#8595;&#8594;</kbd>
              <span className="text-text-secondary">navigate</span>
            </div>
          </div>
          {cursor && (
            <div className="rounded-lg bg-bg-input border border-accent/30 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-3 text-sm font-medium">
                <div className="flex items-center gap-1.5">
                  <span className="text-text-muted text-xs">Bar</span>
                  <span className="text-text-primary font-bold tabular-nums">{cursor.barIndex + 1}</span>
                </div>
                <span className="text-border">&middot;</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-text-muted text-xs">Beat</span>
                  <span className="text-text-primary font-bold tabular-nums">{cursor.beatIndex + 1}</span>
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
                  <span className="text-text-muted text-xs">&rarr;</span>
                )}
                {cursorNote && fretInput && (
                  <span className="px-2 py-1 rounded-lg bg-cta-soft text-cta font-mono font-bold text-sm animate-pulse">
                    {fretInput}
                  </span>
                )}
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
        {selectionBounds && (
          <div
            className="absolute pointer-events-none z-20 rounded-sm transition-all duration-100"
            style={{
              left: selectionBounds.x - 4,
              top: selectionBounds.y - 4,
              width: selectionBounds.w + 8,
              height: selectionBounds.h + 8,
              boxShadow: '0 0 0 2px rgba(34,197,94,0.7), 0 0 20px rgba(34,197,94,0.25)',
              background: 'rgba(34,197,94,0.06)',
            }}
          />
        )}
        {!selectionBounds && barHighlight && (
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

// Package tail watches JSONL transcript files from EOF with fsnotify + poll,
// coalescing bursts (~250ms).
package tail

import (
	"bufio"
	"context"
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

const (
	DefaultCoalesce = 250 * time.Millisecond
	DefaultPoll     = 1 * time.Second
)

// Line is a newly appended JSONL line for an agent.
type Line struct {
	AgentID string
	Path    string
	Data    []byte
}

// Watcher tails multiple files starting at EOF.
type Watcher struct {
	Coalesce time.Duration
	Poll     time.Duration

	mu      sync.Mutex
	offsets map[string]int64  // path -> byte offset
	sizes   map[string]int64  // path -> last seen size (detect shrink/rewrite)
	agents  map[string]string // path -> agentID
	dirs    map[string]struct{}
	out     chan Line
}

func New() *Watcher {
	return &Watcher{
		Coalesce: DefaultCoalesce,
		Poll:     DefaultPoll,
		offsets:  make(map[string]int64),
		sizes:    make(map[string]int64),
		agents:   make(map[string]string),
		dirs:     make(map[string]struct{}),
		out:      make(chan Line, 256),
	}
}

// Events returns the channel of new lines.
func (w *Watcher) Events() <-chan Line { return w.out }

// Track registers a file to tail from EOF. Empty path is ignored.
func (w *Watcher) Track(agentID, path string) error {
	if path == "" || agentID == "" {
		return nil
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	if _, ok := w.agents[path]; ok {
		w.agents[path] = agentID
		return nil
	}
	var off int64
	if st, err := os.Stat(path); err == nil {
		off = st.Size() // start at EOF
	}
	w.offsets[path] = off
	w.sizes[path] = off
	w.agents[path] = agentID
	w.dirs[filepath.Dir(path)] = struct{}{}
	return nil
}

// Untrack stops watching a path.
func (w *Watcher) Untrack(path string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	delete(w.offsets, path)
	delete(w.sizes, path)
	delete(w.agents, path)
}

// SnapshotOffsets returns a copy of path->offset (for tests).
func (w *Watcher) SnapshotOffsets() map[string]int64 {
	w.mu.Lock()
	defer w.mu.Unlock()
	out := make(map[string]int64, len(w.offsets))
	for k, v := range w.offsets {
		out[k] = v
	}
	return out
}

// AddDir allows watching a directory for fsnotify.
func (w *Watcher) AddDir(dir string) {
	w.mu.Lock()
	w.dirs[dir] = struct{}{}
	w.mu.Unlock()
}

// Run watches until ctx is done.
func (w *Watcher) Run(ctx context.Context) error {
	fsw, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	defer fsw.Close()

	w.mu.Lock()
	for dir := range w.dirs {
		_ = fsw.Add(dir)
	}
	w.mu.Unlock()

	coalesce := w.Coalesce
	if coalesce <= 0 {
		coalesce = DefaultCoalesce
	}
	poll := w.Poll
	if poll <= 0 {
		poll = DefaultPoll
	}

	pending := make(map[string]struct{})
	var pendingMu sync.Mutex
	flushTimer := time.NewTimer(coalesce)
	if !flushTimer.Stop() {
		select {
		case <-flushTimer.C:
		default:
		}
	}
	scheduleFlush := func() {
		if !flushTimer.Stop() {
			select {
			case <-flushTimer.C:
			default:
			}
		}
		flushTimer.Reset(coalesce)
	}

	pollTick := time.NewTicker(poll)
	defer pollTick.Stop()

	flush := func() {
		pendingMu.Lock()
		paths := make([]string, 0, len(pending))
		for p := range pending {
			paths = append(paths, p)
		}
		pending = make(map[string]struct{})
		pendingMu.Unlock()
		for _, p := range paths {
			w.readNew(ctx, p)
		}
	}

	mark := func(path string) {
		w.mu.Lock()
		_, tracked := w.agents[path]
		w.mu.Unlock()
		if !tracked {
			return
		}
		pendingMu.Lock()
		pending[path] = struct{}{}
		pendingMu.Unlock()
		scheduleFlush()
	}

	for {
		select {
		case <-ctx.Done():
			flush()
			return ctx.Err()
		case ev, ok := <-fsw.Events:
			if !ok {
				return nil
			}
			if ev.Op&(fsnotify.Write|fsnotify.Create|fsnotify.Rename) != 0 {
				mark(ev.Name)
			}
		case <-fsw.Errors:
			// poll covers gaps
		case <-pollTick.C:
			w.mu.Lock()
			paths := make([]string, 0, len(w.agents))
			dirs := make([]string, 0, len(w.dirs))
			for p := range w.agents {
				paths = append(paths, p)
			}
			for d := range w.dirs {
				dirs = append(dirs, d)
			}
			w.mu.Unlock()
			for _, d := range dirs {
				_ = fsw.Add(d)
			}
			for _, p := range paths {
				mark(p)
			}
		case <-flushTimer.C:
			flush()
		}
	}
}

func (w *Watcher) readNew(ctx context.Context, path string) {
	w.mu.Lock()
	agentID := w.agents[path]
	off := w.offsets[path]
	lastSize := w.sizes[path]
	w.mu.Unlock()
	if agentID == "" {
		return
	}

	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	st, err := f.Stat()
	if err != nil {
		return
	}
	size := st.Size()
	// Truncation / rewrite: size shrank relative to offset or last size.
	if size < off || size < lastSize {
		off = 0
	}
	if size == off {
		w.mu.Lock()
		w.sizes[path] = size
		w.offsets[path] = off
		w.mu.Unlock()
		return
	}
	if _, err := f.Seek(off, io.SeekStart); err != nil {
		return
	}

	r := bufio.NewReader(f)
	var read int64
	for {
		line, err := r.ReadBytes('\n')
		if len(line) > 0 {
			if line[len(line)-1] != '\n' && err == io.EOF {
				// incomplete trailing line — wait for more bytes
				break
			}
			data := line
			if data[len(data)-1] == '\n' {
				data = data[:len(data)-1]
				if len(data) > 0 && data[len(data)-1] == '\r' {
					data = data[:len(data)-1]
				}
			}
			read += int64(len(line))
			if len(data) == 0 {
				continue
			}
			cp := append([]byte(nil), data...)
			select {
			case <-ctx.Done():
				w.mu.Lock()
				w.offsets[path] = off + read
				w.sizes[path] = size
				w.mu.Unlock()
				return
			case w.out <- Line{AgentID: agentID, Path: path, Data: cp}:
			}
		}
		if err != nil {
			break
		}
	}
	w.mu.Lock()
	w.offsets[path] = off + read
	w.sizes[path] = size
	w.mu.Unlock()
}

// ReadOnce reads any new complete lines immediately (tests / manual flush).
func (w *Watcher) ReadOnce(path string) []Line {
	w.readNew(context.Background(), path)
	var got []Line
	for len(w.out) > 0 {
		got = append(got, <-w.out)
	}
	return got
}

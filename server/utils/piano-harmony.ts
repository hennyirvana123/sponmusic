type Note = {
  pitch: number;
  start: number;
  end: number;
  velocity: number;
  confidence: number;
};

type Key = {
  root: number;
  minor: boolean;
  confidence: number;
  scale: number[];
};

type Chord = {
  root: number;
  pcs: number[];
  score: number;
};

type Bar = {
  start: number;
  end: number;
  chord: Chord | null;
};

const pc = (p: number) => (p % 12 + 12) % 12;

const overlap = (n: Note, a: number, b: number) =>
  Math.max(0, Math.min(n.end, b) - Math.max(n.start, a));

const same = (a: Chord, b: Chord) =>
  a.root === b.root && a.pcs.join(',') === b.pcs.join(',');

const make = (
  pitch: number,
  start: number,
  end: number,
  velocity: number
): Note => ({
  pitch,
  start,
  end,
  velocity,
  confidence: 1,
});

/**
 * Generate musically compatible triads for a section.
 */
export function generateChordCandidates(
  notes: Note[],
  melody: Note[],
  key: Key,
  start: number,
  end: number
): Chord[] {
  const weights = Array(12).fill(0);
  const low = Array(12).fill(0);

  let total = 0;

  for (const n of notes) {
    const w = overlap(n, start, end) * n.velocity * n.confidence;

    if (w <= 0) continue;

    weights[pc(n.pitch)] += w;
    total += w;

    if (n.pitch < 55) {
      low[pc(n.pitch)] += w;
    }
  }

  if (total < 0.15) return [];

  const degrees = key.minor
    ? [
        [0, 3, 7],
        [2, 3, 7],
        [3, 4, 7],
        [5, 3, 7],
        [7, 3, 7],
        [7, 4, 7],
        [8, 4, 7],
        [10, 4, 7],
      ]
    : [
        [0, 4, 7],
        [2, 3, 7],
        [4, 3, 7],
        [5, 4, 7],
        [7, 4, 7],
        [9, 3, 7],
        [11, 3, 7],
      ];

  const candidates: Chord[] = [];

  for (const [degree, third, fifth] of degrees) {
    const root = pc(key.root + degree);

    const pcs = [
      root,
      pc(root + third),
      pc(root + fifth),
    ];

    let score =
      pcs.reduce((s, p) => s + weights[p], 0) / total;

    let compatibility = 0;
    let mass = 0;

    for (const n of melody) {
      const duration = overlap(n, start, end);

      if (!duration) continue;

      const strong =
        Math.abs(n.start / 2 - Math.round(n.start / 2)) < 0.065 &&
        n.end - n.start >= 0.5;

      const w = Math.min(duration, 2) * (strong ? 3 : 0.25);

      mass += w;

      compatibility += w * (
        pcs.includes(pc(n.pitch))
          ? 1
          : strong
            ? -1.5
            : -0.1
      );
    }

    if (mass) {
      score += (compatibility / mass) * 0.9;
    }

    score += (low[root] / total) * 0.35;

    // Prefer tonic and dominant slightly.
    if (degree === 0) score += 0.12;

    if (degree === 5 || degree === 7) {
      score += 0.06;
    }

    candidates.push({
      root,
      pcs,
      score,
    });
  }

  return candidates;
}

/**
 * Choose chord progression while strongly preferring
 * smooth root movement and shared chord tones.
 */
export function optimizeChordProgression(
  notes: Note[],
  melody: Note[],
  key: Key,
  total: number
): Bar[] {
  type State = {
    score: number;
    chord: Chord | null;
    prev: number;
  };

  const layers: State[][] = [];
  const bars: Bar[] = [];

  for (let start = 0; start < total; start += 4) {
    const end = Math.min(start + 4, total);

    const candidates = generateChordCandidates(
      notes,
      melody,
      key,
      start,
      end
    );

    const choices: (Chord | null)[] = [
      ...candidates,
    ];

    if (!choices.length) {
      choices.push(null);
    }

    const previousLayer =
      layers[layers.length - 1];

    const layer = choices.map((chord) => {
      const emission = chord
        ? chord.score
        : -0.1;

      if (!previousLayer) {
        return {
          score: emission,
          chord,
          prev: -1,
        };
      }

      let best = -Infinity;
      let bestIndex = 0;

      previousLayer.forEach((previous, index) => {
        let transition = 0;

        if (previous.chord && chord) {
          const rootDistance = Math.min(
            Math.abs(chord.root - previous.chord.root),
            12 -
              Math.abs(
                chord.root - previous.chord.root
              )
          );

          // Strongly reward small root movement.
          if (rootDistance === 0) {
            transition += 0.45;
          } else if (rootDistance <= 2) {
            transition += 0.30;
          } else if (rootDistance <= 4) {
            transition += 0.15;
          } else if (rootDistance <= 5) {
            transition += 0.02;
          } else {
            transition -= 0.28;
          }

          // Shared tones make transitions smoother.
          const shared =
            previous.chord.pcs.filter((p) =>
              chord.pcs.includes(p)
            ).length;

          transition += shared * 0.10;

          if (same(previous.chord, chord)) {
            transition += 0.30;
          }
        } else if (
          !!previous.chord !== !!chord
        ) {
          transition -= 0.10;
        }

        const score =
          previous.score +
          emission +
          transition;

        if (score > best) {
          best = score;
          bestIndex = index;
        }
      });

      return {
        score: best,
        chord,
        prev: bestIndex,
      };
    });

    layers.push(layer);

    bars.push({
      start,
      end,
      chord: null,
    });
  }

  if (!layers.length) return [];

  let index = layers[
    layers.length - 1
  ].reduce(
    (best, state, i, all) =>
      state.score > all[best].score
        ? i
        : best,
    0
  );

  for (
    let i = layers.length - 1;
    i >= 0;
    i--
  ) {
    bars[i].chord =
      layers[i][index].chord;

    index =
      layers[i][index].prev;
  }

  return bars;
}

/**
 * Create a close-position piano voicing.
 *
 * Unlike the old version, this searches around the
 * previous voicing so the hand does not suddenly jump.
 */
export function createVoicing(
  chord: Chord,
  previous: number[],
  ceiling: number
): number[] {
  const targetCeiling = Math.min(
    ceiling,
    67
  );

  const previousCenter =
    previous.length
      ? previous.reduce((a, b) => a + b, 0) /
        previous.length
      : 52;

  let best: number[] = [];
  let bestCost = Infinity;

  // Try every inversion around the previous position.
  for (let base = 43; base <= 60; base++) {
    for (
      let inversion = 0;
      inversion < 3;
      inversion++
    ) {
      const ordered =
        chord.pcs
          .map((p) => pc(p))
          .sort((a, b) => a - b);

      const rotated = [
        ...ordered.slice(inversion),
        ...ordered.slice(0, inversion),
      ];

      const candidate: number[] = [];

      let last = -Infinity;

      for (const pitchClass of rotated) {
        let pitch =
          base +
          pc(pitchClass - pc(base));

        while (pitch <= last) {
          pitch += 12;
        }

        while (
          pitch - previousCenter > 8
        ) {
          pitch -= 12;
        }

        while (
          previousCenter - pitch > 8
        ) {
          pitch += 12;
        }

        if (
          pitch > last &&
          pitch <= targetCeiling
        ) {
          candidate.push(pitch);
          last = pitch;
        }
      }

      if (candidate.length !== 3) {
        continue;
      }

      if (
        candidate[candidate.length - 1] -
          candidate[0] >
        12
      ) {
        continue;
      }

      let movement = 0;

      if (previous.length) {
        for (let i = 0; i < 3; i++) {
          movement += Math.abs(
            candidate[i] -
              (previous[i] ??
                candidate[i])
          );
        }
      } else {
        movement =
          Math.abs(candidate[0] - 48) +
          Math.abs(candidate[1] - 52) +
          Math.abs(candidate[2] - 55);
      }

      const centerDistance =
        Math.abs(
          candidate.reduce(
            (a, b) => a + b,
            0
          ) /
            candidate.length -
            previousCenter
        );

      const commonToneBonus =
        previous.length
          ? candidate.filter((p) =>
              previous.includes(p)
            ).length * 3
          : 0;

      const cost =
        movement +
        centerDistance * 0.8 -
        commonToneBonus;

      if (cost < bestCost) {
        bestCost = cost;
        best = candidate;
      }
    }
  }

  return best;
}

/**
 * Generate simple but musical piano accompaniment.
 *
 * Important:
 * - no separate bass
 * - no aggressive broken-chord jumps
 * - accompaniment follows melody duration
 * - final accompaniment reaches the end of the melody
 */
export function generateAccompaniment(
  bars: Bar[],
  melody: Note[],
  bpm: number
) {
  const chords: Note[] = [];

  let previous: number[] = [];

  if (!melody.length) {
    return { chords };
  }

  const songEnd = Math.max(
    ...melody.map((n) => n.end)
  );

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];

    if (!bar.chord) continue;

    const phrase = melody.filter(
      (n) =>
        overlap(
          n,
          bar.start,
          bar.end
        ) > 0
    );

    if (!phrase.length) continue;

    const first = phrase[0];

    const nextPhrase =
      melody.find(
        (n) => n.start >= bar.end
      );

    const phraseEnd =
      nextPhrase
        ? Math.min(
            bar.end,
            nextPhrase.start
          )
        : Math.min(
            bar.end,
            songEnd
          );

    const melodyPitch =
      Math.min(
        ...phrase.map((n) => n.pitch)
      );

    // Keep accompaniment below melody.
    const ceiling = Math.min(
      melodyPitch - 4,
      67
    );

    const voicing = createVoicing(
      bar.chord,
      previous,
      ceiling
    );

    if (!voicing.length) {
      continue;
    }

    previous = voicing;

    const start = Math.max(
      bar.start,
      first.start
    );

    let end = Math.min(
      phraseEnd,
      songEnd
    );

    // Prevent tiny gaps at bar boundaries.
    if (
      nextPhrase &&
      nextPhrase.start - end < 0.20
    ) {
      end = Math.min(
        nextPhrase.start,
        songEnd
      );
    }

    if (end <= start + 0.20) {
      continue;
    }

    /*
     * Piano-only accompaniment:
     * sustain the chord instead of producing
     * excessive broken notes.
     */
    const duration =
      end - start;

    const velocity =
      i === bars.length - 1
        ? 0.24
        : 0.27;

    for (const pitch of voicing) {
      chords.push(
        make(
          pitch,
          start,
          end,
          velocity
        )
      );
    }

    /*
     * On the final bar, slightly extend
     * the chord to the actual melody ending.
     */
    if (
      !nextPhrase &&
      end >= songEnd - 0.05
    ) {
      const finalEnd = songEnd;

      for (const pitch of voicing) {
        chords.push(
          make(
            pitch,
            Math.max(
              start,
              finalEnd - Math.min(duration, 2)
            ),
            finalEnd,
            0.22
          )
        );
      }
    }
  }

  return { chords };
}

/**
 * Remove excessive accompaniment density
 * while preserving smooth sustained chords.
 */
export function controlDensity(
  melody: Note[],
  chords: Note[]
) {
  const output: Note[] = [];

  for (
    const n of [...chords].sort(
      (a, b) =>
        a.start - b.start ||
        a.pitch - b.pitch
    )
  ) {
    // Do not place accompaniment directly
    // underneath a melody note.
    if (
      melody.some(
        (m) =>
          overlap(
            m,
            n.start,
            n.end
          ) > 0 &&
          n.pitch >= m.pitch - 4
      )
    ) {
      continue;
    }

    // Prevent duplicate pitches.
    if (
      output.some(
        (x) =>
          x.pitch === n.pitch &&
          overlap(
            x,
            n.start,
            n.end
          ) > 0
      )
    ) {
      continue;
    }

    // Keep the accompaniment inside
    // a comfortable piano hand range.
    if (
      n.pitch < 36 ||
      n.pitch > 72
    ) {
      continue;
    }

    output.push(n);
  }

  return {
    chords: output,
  };
}

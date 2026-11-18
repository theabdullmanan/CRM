import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { isPreview, previewDb } from '../lib/preview';

/**
 * Real-time subscription to a Firestore query.
 * `buildQuery` returns a Query (or null to skip). `deps` controls re-subscription.
 * `preview` returns sample rows when the app runs without Firebase (preview mode).
 */
export function useCollection(buildQuery, deps = [], preview) {
  const [state, setState] = useState(() =>
    isPreview ? { data: preview?.() || [], loading: false, error: null, fromCache: false } : { data: [], loading: true, error: null, fromCache: false });

  useEffect(() => {
    if (isPreview) {
      setState({ data: preview?.() || [], loading: false, error: null, fromCache: false });
      return undefined;
    }
    const q = buildQuery();
    if (!q) {
      setState({ data: [], loading: false, error: null, fromCache: false });
      return undefined;
    }
    setState((s) => ({ ...s, loading: true }));
    // includeMetadataChanges so a second, server-confirmed snapshot follows the instant local-cache
    // one — `fromCache` lets pages show a "syncing" hint instead of silently swapping numbers.
    return onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => setState({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() })), loading: false, error: null, fromCache: snap.metadata.fromCache }),
      (error) => {
        console.error('[useCollection]', error);
        // Keep what's already on screen; wiping it made cached rows flash and then vanish.
        setState((s) => ({ ...s, loading: false, error }));
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

export function useDocument(path, id) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  useEffect(() => {
    if (isPreview) {
      setState({ data: (previewDb[path] || []).find((d) => d.id === id) || null, loading: false, error: null });
      return undefined;
    }
    if (!id) {
      setState({ data: null, loading: false, error: null });
      return undefined;
    }
    return onSnapshot(
      doc(db, path, id),
      (snap) => setState({ data: snap.exists() ? { id: snap.id, ...snap.data() } : null, loading: false, error: null }),
      (error) => setState({ data: null, loading: false, error }),
    );
  }, [path, id]);
  return state;
}

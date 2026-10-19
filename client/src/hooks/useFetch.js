import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Custom hook: loads data when the component mounts (and whenever `deps` change).
 *
 *   const { data, setData, loading, error, refetch } = useFetch((signal) => getPolls('all', signal), [scope], []);
 *
 * - `fetcher(signal)` returns a promise; the AbortSignal cancels it on unmount / newer request
 * - `initialData` is what `data` holds until the first response arrives
 * - `setData` lets the component update the loaded records itself (add / delete) without refetching
 */
export default function useFetch(fetcher, deps = [], initialData = null) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError('');
    try {
      const result = await fetcherRef.current(signal);
      if (!signal?.aborted) setData(result);
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const refetch = useCallback(() => load(), [load]);

  return { data, setData, loading, error, refetch };
}

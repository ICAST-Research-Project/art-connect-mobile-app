// /* eslint-disable react-hooks/exhaustive-deps */
// import { useEffect, useState } from "react";

// const useFetch = <T>(fetchFunction: () => Promise<T>, autoFetch = true) => {
//   const [data, setData] = useState<T | null>(null);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState<Error | null>(null);

//   const fetchData = async () => {
//     try {
//       setLoading(true);
//       setError(null);

//       const result = await fetchFunction();

//       setData(result);
//     } catch (err) {
//       setError(err instanceof Error ? err : new Error("An error occured"));
//     } finally {
//       setLoading(false);
//     }
//   };
//   const reset = () => {
//     setData(null);
//     setLoading(false);
//     setError(null);
//   };

//   useEffect(() => {
//     if (autoFetch) {
//       fetchData();
//     }
//   }, []);
//   return { data, loading, error, refetch: fetchData, reset };
// };

// export default useFetch;

/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useState } from "react";

/**
 * Custom hook for fetching data with proper dependency tracking.
 *
 * @param fetchFunction - The async function that fetches data
 * @param autoFetch - Whether to auto-fetch on mount and when deps change (default: true)
 * @param deps - Optional dependency array that triggers refetch when changed
 */
const useFetch = <T>(
  fetchFunction: () => Promise<T>,
  autoFetch = true,
  deps: React.DependencyList = [],
) => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await fetchFunction();

      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("An error occurred"));
    } finally {
      setLoading(false);
    }
  }, [fetchFunction]);

  const reset = () => {
    setData(null);
    setLoading(false);
    setError(null);
  };

  useEffect(() => {
    if (autoFetch) {
      fetchData();
    }
  }, [autoFetch, ...deps]); // Re-fetch when autoFetch or deps change

  return { data, loading, error, refetch: fetchData, reset };
};

export default useFetch;

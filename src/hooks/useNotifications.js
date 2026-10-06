import { useCallback, useRef, useState } from 'react';

let nextId = 1;

/** Toast-style messages, newest last, with a stable id for dismissal. */
export default function useNotifications(t) {
  const [items, setItems] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setItems((current) => current.filter((item) => item.id !== id));
    const timer = timers.current[id];
    if (timer) {
      clearTimeout(timer);
      delete timers.current[id];
    }
  }, []);

  const notify = useCallback(
    (tone, key, params) => {
      const id = nextId;
      nextId += 1;
      const item = { id, tone, text: t(key, params) };
      setItems((current) => [...current.slice(-4), item]);
      timers.current[id] = setTimeout(() => dismiss(id), tone === 'bad' ? 12000 : 7000);
      return id;
    },
    [t, dismiss],
  );

  return { notifications: items, notify, dismiss };
}
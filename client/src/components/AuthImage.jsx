import { useEffect, useState } from 'react';
import { fetchImageUrl } from '../api/index.js';

/**
 * <img> for pictures that need the login token (poll photos, uploaded avatars).
 * - "/api/..." sources are fetched with the Authorization header -> blob: URL
 * - anything else (an external https avatar) is a normal <img>
 */
export default function AuthImage({ src, alt = '', className = '', onError, ...rest }) {
  const protectedSrc = typeof src === 'string' && src.startsWith('/api/');
  const [blobUrl, setBlobUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!protectedSrc) return undefined;
    let cancelled = false;
    setBlobUrl(null);
    setFailed(false);
    fetchImageUrl(src)
      .then((url) => !cancelled && setBlobUrl(url))
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          onError?.();
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, protectedSrc]);

  if (protectedSrc) {
    if (failed) return null;
    if (!blobUrl) return <span className={`skeleton block ${className}`} role="img" aria-label={alt || 'Loading image'} />;
    return <img src={blobUrl} alt={alt} className={className} decoding="async" {...rest} />;
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={onError}
      {...rest}
    />
  );
}

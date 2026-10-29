import { useEffect, useState, type CSSProperties } from 'react';
import { fileUrl } from '../services/api';

/** Imagen dentro de un marco con marcas de recorte. Carga diferida y aviso si la URL firmada caducó. */
export function ImageFrame({ src, alt, width, height, eager }: { src: string; alt: string; width?: number; height?: number; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const ratio = width && height ? `${width} / ${height}` : '1 / 1';
  return (
    <span className="frame" style={{ aspectRatio: ratio }}>
      {failed ? (
        <span className="frame-missing">Imagen no disponible. Recarga la pantalla para renovar el enlace.</span>
      ) : (
        <img src={fileUrl(src)} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" width={width} height={height} onError={() => setFailed(true)} />
      )}
    </span>
  );
}

/** Marco con iniciales para personajes (la API no devuelve imagen de personaje). */
export function Monogram({ name, id }: { name: string; id: string }) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const hue = 235 + (h % 70); // azules a violetas, dentro de la marca
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span className="frame monogram" aria-hidden="true" style={{ '--mono-hue': hue } as CSSProperties}>
      <span>{initials || '?'}</span>
    </span>
  );
}

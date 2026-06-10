import { useEffect, useRef } from "react";
import QR from "qrcode";

interface Props {
  value: string;
  size?: number;
}

export function QRCode({ value, size = 200 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) {
      void QR.toCanvas(ref.current, value, { width: size, margin: 1 });
    }
  }, [value, size]);
  return (
    <div className="qr-box">
      <canvas ref={ref} width={size} height={size} aria-label="QR code" />
    </div>
  );
}

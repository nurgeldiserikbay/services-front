export default function Loading() {
  return <main className="shell publicDetail" aria-busy="true">
    <p role="status" aria-live="polite" className="message">Жүктелуде… · Загружаем…</p>
  </main>;
}

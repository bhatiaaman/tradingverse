import ScannerPage from '../page';

export default async function ScannerRoute({ params }) {
  const resolved = await params;
  const raw = resolved?.slug || '';
  const scanName = decodeURIComponent(raw).replace(/[-_]+/g, ' ');
  return <ScannerPage scanName={scanName} scanSlug={raw} />;
}

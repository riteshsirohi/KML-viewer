import KmlViewerWrapper from "@/components/kml-viewer-wrapper"

export default function Home() {
  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">KML File Viewer</h1>
        <KmlViewerWrapper />
      </div>
    </main>
  )
}


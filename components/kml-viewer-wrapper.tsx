"use client"

import dynamic from "next/dynamic"
import { Suspense } from "react"

// Dynamically import the KmlViewer component with SSR disabled
const KmlViewer = dynamic(() => import("@/components/kml-viewer"), {
  ssr: false, // This prevents the component from being rendered on the server
  loading: () => <KmlViewerLoading />,
})

function KmlViewerLoading() {
  return (
    <div className="h-[500px] rounded-lg overflow-hidden border flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
        <p className="mt-4 text-muted-foreground">Loading map viewer...</p>
      </div>
    </div>
  )
}

export default function KmlViewerWrapper() {
  return (
    <Suspense fallback={<KmlViewerLoading />}>
      <KmlViewer />
    </Suspense>
  )
}


"use client"

import { useState, useEffect, useRef } from "react"
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { kml } from "@tmcw/togeojson" // Correct import for the toGeoJSON library
import { Button } from "@/components/ui/button"
import { Upload, Plane } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

// Import Leaflet only on the client side
import * as L from "leaflet"

// Function to extract coordinates from KML (basic implementation)
function extractCoordinatesFromKML(kmlDoc) {
  try {
    const placemarks = kmlDoc.querySelectorAll("Placemark")
    if (!placemarks || placemarks.length === 0) {
      console.warn("No Placemarks found in KML")
      return null
    }

    const features = []

    placemarks.forEach((placemark, index) => {
      const name = placemark.querySelector("name")?.textContent || `Placemark ${index}`
      const description = placemark.querySelector("description")?.textContent || ""

      // Try to extract Point coordinates
      const pointCoords = placemark.querySelector("Point coordinates")?.textContent
      if (pointCoords) {
        try {
          const coords = pointCoords.trim().split(",").map(Number)
          if (coords.length >= 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
            features.push({
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [coords[0], coords[1]],
              },
              properties: {
                name: name,
                description: description,
              },
            })
          }
        } catch (e) {
          console.warn("Failed to parse Point coordinates", e)
        }
      }

      // Try to extract LineString coordinates
      const lineCoords = placemark.querySelector("LineString coordinates")?.textContent
      if (lineCoords) {
        try {
          const coordPairs = lineCoords.trim().split(/\s+/)
          const coordinates = coordPairs
            .map((pair) => {
              const coords = pair.split(",").map(Number)
              return coords.length >= 2 && !isNaN(coords[0]) && !isNaN(coords[1]) ? [coords[0], coords[1]] : null
            })
            .filter(Boolean)

          if (coordinates.length >= 2) {
            features.push({
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates: coordinates,
              },
              properties: {
                name: name,
                description: description,
              },
            })
          }
        } catch (e) {
          console.warn("Failed to parse LineString coordinates", e)
        }
      }

      // Try to extract Polygon coordinates
      const polygonRing = placemark.querySelector("Polygon outerBoundaryIs LinearRing coordinates")?.textContent
      if (polygonRing) {
        try {
          const coordPairs = polygonRing.trim().split(/\s+/)
          const coordinates = coordPairs
            .map((pair) => {
              const coords = pair.split(",").map(Number)
              return coords.length >= 2 && !isNaN(coords[0]) && !isNaN(coords[1]) ? [coords[0], coords[1]] : null
            })
            .filter(Boolean)

          if (coordinates.length >= 3) {
            features.push({
              type: "Feature",
              geometry: {
                type: "Polygon",
                coordinates: [coordinates], // Polygon coordinates are an array of rings
              },
              properties: {
                name: name,
                description: description,
              },
            })
          }
        } catch (e) {
          console.warn("Failed to parse Polygon coordinates", e)
        }
      }
    })

    if (features.length === 0) {
      console.warn("No supported geometry found in KML")
      return null
    }

    return {
      type: "FeatureCollection",
      features: features,
    }
  } catch (error) {
    console.error("Error extracting coordinates from KML:", error)
    return null
  }
}

// Function to calculate the length of a line in meters using the Haversine formula
function calculateLength(coordinates) {
  let totalDistance = 0

  for (let i = 0; i < coordinates.length - 1; i++) {
    const [lon1, lat1] = coordinates[i]
    const [lon2, lat2] = coordinates[i + 1]

    const R = 6371e3 // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180 // φ, λ in radians
    const φ2 = (lat2 * Math.PI) / 180
    const Δφ = ((lat2 - lat1) * Math.PI) / 180
    const Δλ = ((lon2 - lon1) * Math.PI) / 180

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    const distance = R * c
    totalDistance += distance
  }

  return totalDistance
}

// Create custom marker icons - moved inside component to avoid server-side execution
const createCustomIcon = (iconUrl, iconSize = [25, 25]) => {
  return L.icon({
    iconUrl,
    iconSize,
    iconAnchor: [iconSize[0] / 2, iconSize[1] / 2],
    popupAnchor: [0, -iconSize[1] / 2],
  })
}

// FitBounds component
const FitBoundsToData = ({ data }) => {
  const map = useMap()

  useEffect(() => {
    if (data && data.features && data.features.length > 0) {
      try {
        const geoJsonLayer = L.geoJSON(data)
        const bounds = geoJsonLayer.getBounds()
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [20, 20] })
        } else {
          console.warn("Invalid bounds, cannot fit map to data")
        }
      } catch (error) {
        console.error("Error fitting bounds:", error)
      }
    }
  }, [data, map])

  return null
}

export default function KmlViewer() {
  const [kmlData, setKmlData] = useState(null)
  const [geoJsonData, setGeoJsonData] = useState(null)
  const [summary, setSummary] = useState(null)
  const [detailed, setDetailed] = useState(null)
  const [showSummary, setShowSummary] = useState(false)
  const [showDetailed, setShowDetailed] = useState(false)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [mapKey, setMapKey] = useState(Date.now()) // Force map remount when needed
  const fileInputRef = useRef(null)
  const [iconType, setIconType] = useState("plane") // Default icon type
  const mapRef = useRef(null)

  // Create icons only on the client side
  const [planeIcon, setPlaneIcon] = useState(null)
  const [defaultIcon, setDefaultIcon] = useState(null)

  // Initialize icons on client side only
  useEffect(() => {
    // Create icons
    setPlaneIcon(createCustomIcon("https://cdn-icons-png.flaticon.com/512/61/61212.png", [32, 32]))
    setDefaultIcon(createCustomIcon("https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png", [25, 41]))

    // Fix Leaflet icon issues
    delete (L.Icon.Default.prototype as any)._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
    })
  }, [])

  // Cleanup function for map
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
      }
    }
  }, [])

  const handleFileUpload = (event) => {
    const file = event.target.files[0]
    if (!file) return

    if (!file.name.endsWith(".kml")) {
      setError("Please upload a valid KML file")
      return
    }

    setError("")
    setIsLoading(true)

    // Reset the map to prevent stale data
    setGeoJsonData(null)
    setMapKey(Date.now())

    // Use setTimeout to allow the UI to update before heavy processing
    setTimeout(() => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const kmlContent = e.target.result
          setKmlData(kmlContent)

          // Parse KML to DOM with error handling
          const parser = new DOMParser()
          const kmlDoc = parser.parseFromString(kmlContent as string, "text/xml")

          // Check for parsing errors
          const parserError = kmlDoc.getElementsByTagName("parsererror")
          if (parserError.length > 0) {
            throw new Error("XML parsing error in KML file")
          }

          // Try to convert to GeoJSON using toGeoJSON library
          let geoJson = null
          try {
            // Use the imported kml function directly
            geoJson = kml(kmlDoc)

            // Check if we have valid features
            if (!geoJson || !geoJson.features || geoJson.features.length === 0) {
              console.warn("No features found with toGeoJSON library")
              geoJson = null
            }
          } catch (geoJsonError) {
            console.error("toGeoJSON conversion error:", geoJsonError)
            geoJson = null
          }

          // If toGeoJSON failed, try our manual parser
          if (!geoJson) {
            console.log("Attempting manual KML parsing...")
            geoJson = extractCoordinatesFromKML(kmlDoc)

            if (!geoJson) {
              throw new Error("Could not extract any valid features from the KML file")
            }
          }

          // Optimize GeoJSON for rendering
          const optimizedGeoJson = optimizeGeoJson(geoJson)

          // Reset views
          setShowSummary(false)
          setShowDetailed(false)

          // Set the optimized GeoJSON data
          setGeoJsonData(optimizedGeoJson)
        } catch (err) {
          setError(`Failed to parse KML file: ${err.message}. Please check the file format.`)
          console.error("KML parsing error:", err)
        } finally {
          setIsLoading(false)
        }
      }

      reader.onerror = () => {
        setError("Error reading the file. Please try again.")
        setIsLoading(false)
      }

      reader.readAsText(file)
    }, 100) // Small delay to allow UI to update
  }

  // Function to optimize GeoJSON for rendering
  const optimizeGeoJson = (geoJson) => {
    if (!geoJson || !geoJson.features) return geoJson

    // Limit the number of points in LineStrings to improve performance
    const MAX_POINTS = 1000

    const optimizedFeatures = geoJson.features.map((feature) => {
      // Ensure all features have properties
      if (!feature.properties) {
        feature.properties = {}
      }

      // Optimize LineStrings by reducing points if there are too many
      if (feature.geometry.type === "LineString" && feature.geometry.coordinates.length > MAX_POINTS) {
        const step = Math.ceil(feature.geometry.coordinates.length / MAX_POINTS)
        const reducedCoords = []

        // Always include first and last point
        reducedCoords.push(feature.geometry.coordinates[0])

        // Add points at regular intervals
        for (let i = step; i < feature.geometry.coordinates.length - step; i += step) {
          reducedCoords.push(feature.geometry.coordinates[i])
        }

        // Add the last point
        reducedCoords.push(feature.geometry.coordinates[feature.geometry.coordinates.length - 1])

        return {
          ...feature,
          geometry: {
            ...feature.geometry,
            coordinates: reducedCoords,
          },
        }
      }

      // Optimize Polygons by reducing points if there are too many
      if (feature.geometry.type === "Polygon") {
        const optimizedPolygon = feature.geometry.coordinates.map((ring) => {
          if (ring.length > MAX_POINTS) {
            const step = Math.ceil(ring.length / MAX_POINTS)
            const reducedRing = []

            // Always include first point (which is also the last in a ring)
            reducedRing.push(ring[0])

            // Add points at regular intervals
            for (let i = step; i < ring.length - step; i += step) {
              reducedRing.push(ring[i])
            }

            // Add the last point
            reducedRing.push(ring[ring.length - 1])

            return reducedRing
          }
          return ring
        })

        return {
          ...feature,
          geometry: {
            ...feature.geometry,
            coordinates: optimizedPolygon,
          },
        }
      }

      return feature
    })

    return {
      ...geoJson,
      features: optimizedFeatures,
    }
  }

  const generateSummary = () => {
    if (!geoJsonData) return

    const elementCounts = {
      Point: 0,
      LineString: 0,
      Polygon: 0,
      MultiPoint: 0,
      MultiLineString: 0,
      MultiPolygon: 0,
    }

    geoJsonData.features.forEach((feature) => {
      if (elementCounts.hasOwnProperty(feature.geometry.type)) {
        elementCounts[feature.geometry.type]++
      }
    })

    setSummary(elementCounts)
    setShowSummary(true)
    setShowDetailed(false)
  }

  const generateDetailed = () => {
    if (!geoJsonData) return

    const detailedInfo = []

    geoJsonData.features.forEach((feature, index) => {
      const type = feature.geometry.type
      let length = 0

      if (type === "LineString") {
        length = calculateLength(feature.geometry.coordinates)
      } else if (type === "MultiLineString") {
        feature.geometry.coordinates.forEach((line) => {
          length += calculateLength(line)
        })
      }

      detailedInfo.push({
        id: index,
        type,
        name: feature.properties.name || `Element ${index}`,
        description: feature.properties.description || "No description",
        length: length > 0 ? (length / 1000).toFixed(2) : null, // Convert to km
      })
    })

    setDetailed(detailedInfo)
    setShowDetailed(true)
    setShowSummary(false)
  }

  const handleButtonClick = () => {
    fileInputRef.current.click()
  }

  const toggleIconType = () => {
    setIconType(iconType === "plane" ? "default" : "plane")
  }

  // Function to handle map initialization
  const handleMapInit = (map) => {
    mapRef.current = map

    // Set a lower minZoom to allow viewing the entire world
    map.setMinZoom(1)

    // Improve performance by disabling animations when not needed
    map.options.fadeAnimation = false
    map.options.zoomAnimation = typeof window !== "undefined" && window.innerWidth > 768 // Only enable on larger screens

    // Add a handler for when the map is ready
    map.whenReady(() => {
      console.log("Map is ready")
    })
  }

  // Reset the map if it gets stuck
  const handleResetMap = () => {
    setMapKey(Date.now())
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
        <Button onClick={handleButtonClick} className="flex items-center gap-2">
          <Upload size={16} />
          Upload KML File
        </Button>
        <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".kml" className="hidden" />

        <Button
          onClick={generateSummary}
          disabled={!geoJsonData || isLoading}
          variant={showSummary ? "default" : "outline"}
        >
          Summary
        </Button>

        <Button
          onClick={generateDetailed}
          disabled={!geoJsonData || isLoading}
          variant={showDetailed ? "default" : "outline"}
        >
          Detailed
        </Button>

        <Button
          onClick={toggleIconType}
          disabled={!geoJsonData || isLoading}
          variant="outline"
          className="flex items-center gap-2"
        >
          <Plane size={16} />
          {iconType === "plane" ? "Use Default Markers" : "Use Plane Markers"}
        </Button>

        <Button onClick={handleResetMap} variant="outline" className="ml-auto">
          Reset Map
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isLoading && (
        <div className="h-[500px] rounded-lg overflow-hidden border flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
            <p className="mt-4 text-muted-foreground">Processing KML file...</p>
          </div>
        </div>
      )}

      {!isLoading && geoJsonData && (
        <div className="h-[500px] rounded-lg overflow-hidden border">
          <MapContainer
            key={mapKey}
            center={[0, 0]}
            zoom={2}
            style={{ height: "100%", width: "100%" }}
            attributionControl={true}
            whenCreated={handleMapInit}
            preferCanvas={true} // Use Canvas renderer for better performance
            worldCopyJump={true} // Enables seamless horizontal panning
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              noWrap={false} // Allow the map to repeat horizontally
            />
            <GeoJSON
              key={`geojson-${iconType}-${Date.now()}`}
              data={geoJsonData}
              style={(feature) => {
                // Style lines differently from points and polygons
                switch (feature.geometry.type) {
                  case "LineString":
                  case "MultiLineString":
                    return {
                      color: "#3388ff",
                      weight: 3,
                      opacity: 0.7,
                    }
                  case "Polygon":
                  case "MultiPolygon":
                    return {
                      fillColor: "#3388ff",
                      fillOpacity: 0.2,
                      color: "#3388ff",
                      weight: 2,
                    }
                  default:
                    return {}
                }
              }}
              pointToLayer={(feature, latlng) => {
                // Use custom icon for points based on the selected icon type
                if (iconType === "plane" && planeIcon) {
                  return L.marker(latlng, { icon: planeIcon })
                } else {
                  // Fallback to circle markers if not using plane icons or if icon isn't loaded
                  return L.circleMarker(latlng, {
                    radius: 8,
                    fillColor: "#ff7800",
                    color: "#000",
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8,
                  })
                }
              }}
              onEachFeature={(feature, layer) => {
                // Add popups with feature information
                let popupContent = ""

                if (feature.properties && feature.properties.name) {
                  popupContent += `<strong>${feature.properties.name}</strong><br/>`
                }

                if (feature.properties && feature.properties.description) {
                  // Clean up description - remove HTML tags if needed
                  const description = feature.properties.description
                    .replace(/<[^>]*>/g, " ") // Replace HTML tags with spaces
                    .replace(/\s+/g, " ") // Replace multiple spaces with a single space
                    .trim()

                  if (description) {
                    popupContent += `${description}<br/>`
                  }
                }

                popupContent += `Type: ${feature.geometry.type}`

                if (feature.geometry.type === "LineString" || feature.geometry.type === "MultiLineString") {
                  let length = 0

                  if (feature.geometry.type === "LineString") {
                    length = calculateLength(feature.geometry.coordinates)
                  } else {
                    feature.geometry.coordinates.forEach((line) => {
                      length += calculateLength(line)
                    })
                  }

                  popupContent += `<br/>Length: ${(length / 1000).toFixed(2)} km`
                }

                layer.bindPopup(popupContent)
              }}
            />
            <FitBoundsToData data={geoJsonData} />
          </MapContainer>
        </div>
      )}

      {!isLoading && !geoJsonData && (
        <div className="text-center p-12 border border-dashed rounded-lg">
          <p className="text-muted-foreground">Upload a KML file to view its contents on the map</p>
        </div>
      )}

      {showSummary && summary && (
        <Card className="p-4">
          <h2 className="text-xl font-semibold mb-4">KML Summary</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Element Type</TableHead>
                <TableHead>Count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(summary).map(
                ([type, count]) =>
                  count > 0 && (
                    <TableRow key={type}>
                      <TableCell>{type}</TableCell>
                      <TableCell>{count}</TableCell>
                    </TableRow>
                  ),
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {showDetailed && detailed && (
        <Card className="p-4">
          <h2 className="text-xl font-semibold mb-4">Detailed Information</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Length (km)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detailed.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.type}</TableCell>
                  <TableCell>{item.length || "N/A"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}


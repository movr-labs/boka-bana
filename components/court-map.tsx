"use client";

/* eslint-disable @next/next/no-img-element -- Map tiles are remote x/y/z images, not optimizable content images. */

import { Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";

export type CourtMapPoint = {
  id: string;
  name: string;
  city?: string;
  latitude: number | null;
  longitude: number | null;
  optionsCount?: number;
  firstTime?: string;
};

export type CourtMapViewport = {
  center: {
    latitude: number;
    longitude: number;
  };
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  zoom: number;
};

type CourtMapProps = {
  points: CourtMapPoint[];
  selectedId?: string | null;
  variant?: "preview" | "full";
  loading?: boolean;
  className?: string;
  initialView?: MapView;
  onSelect?: (point: CourtMapPoint) => void;
  onViewportChange?: (viewport: CourtMapViewport) => void;
  preserveViewOnPointsChange?: boolean;
};

type MapSize = {
  width: number;
  height: number;
};

type MapView = {
  center: {
    latitude: number;
    longitude: number;
  };
  zoom: number;
};

type DragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startCenter: MapView["center"];
};

const TILE_SIZE = 256;
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const FALLBACK_CENTER = { latitude: 59.3293, longitude: 18.0686 };
const MIN_ZOOM = 4;
const MAX_ZOOM = 17;

export default function CourtMap({
  points,
  selectedId,
  variant = "preview",
  loading = false,
  className = "",
  initialView: preferredInitialView,
  onSelect,
  onViewportChange,
  preserveViewOnPointsChange = false,
}: CourtMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [size, setSize] = useState<MapSize>({ width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);
  const [initializedView, setInitializedView] = useState(false);

  useEffect(() => {
    const node = mapRef.current;
    if (!node) return;

    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const visiblePoints = useMemo(
    () => points.filter((point) => point.latitude != null && point.longitude != null),
    [points],
  );
  const initialView = useMemo(
    () => normalizeInitialView(preferredInitialView) ?? createMapView(visiblePoints, variant),
    [preferredInitialView, visiblePoints, variant],
  );
  const [view, setView] = useState(initialView);

  useEffect(() => {
    if (preserveViewOnPointsChange && initializedView) return;
    setView(initialView);
    if (preferredInitialView || visiblePoints.length > 0) {
      setInitializedView(true);
    }
  }, [initialView, initializedView, preserveViewOnPointsChange, preferredInitialView, visiblePoints.length]);

  const tiles = useMemo(() => createTiles(view, size), [view, size]);
  const markers = useMemo(() => projectMarkers(visiblePoints, view, size), [visiblePoints, view, size]);

  useEffect(() => {
    if (!size.width || !size.height) return;
    onViewportChange?.(createViewport(view, size));
  }, [onViewportChange, size, view]);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("button,a,input,select,textarea")) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCenter: view.center,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const startWorld = latLngToWorld(drag.startCenter.latitude, drag.startCenter.longitude, view.zoom);
    const nextWorld = {
      x: startWorld.x - (event.clientX - drag.startClientX),
      y: startWorld.y - (event.clientY - drag.startClientY),
    };
    const nextCenter = worldToLatLng(nextWorld.x, nextWorld.y, view.zoom);
    setView((current) => ({
      ...current,
      center: nextCenter,
    }));
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
  }

  function zoomBy(delta: number, anchor?: { x: number; y: number }) {
    setView((current) => zoomView(current, delta, size, anchor));
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (!size.width || !size.height) return;
    event.preventDefault();

    const rect = event.currentTarget.getBoundingClientRect();
    const anchor = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    zoomBy(event.deltaY < 0 ? 1 : -1, anchor);
  }

  return (
    <div
      ref={mapRef}
      className={`court-map ${variant} ${dragging ? "dragging" : ""} ${className}`}
      aria-label="Karta över lediga banor"
      onLostPointerCapture={endDrag}
      onPointerCancel={endDrag}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onWheel={handleWheel}
    >
      <div className="court-map-tiles" aria-hidden="true">
        {tiles.map((tile) => (
          <img
            alt=""
            className="court-map-tile"
            draggable={false}
            key={`${tile.zoom}:${tile.x}:${tile.y}`}
            src={tile.url}
            style={{ left: tile.left, top: tile.top }}
          />
        ))}
      </div>

      <div className="court-map-markers">
        {markers.map(({ point, left, top }) => {
          const selected = selectedId === point.id;
          return (
            <button
              aria-label={point.name}
              className={`court-map-marker ${selected ? "selected" : ""}`}
              key={point.id}
              onClick={() => onSelect?.(point)}
              style={{ left, top }}
              type="button"
            >
              <span className="court-map-pin" />
              {variant === "full" ? (
                <span className="court-map-marker-label">
                  <strong>{point.name}</strong>
                  <span>{point.optionsCount != null ? `${point.optionsCount} tider` : point.city ?? ""}</span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {loading ? <div className="court-map-loading">Hämtar tider</div> : null}

      <div className="court-map-zoom" aria-label="Zooma kartan">
        <button aria-label="Zooma in" onClick={() => zoomBy(1)} type="button">
          <Plus size={18} />
        </button>
        <button aria-label="Zooma ut" onClick={() => zoomBy(-1)} type="button">
          <Minus size={18} />
        </button>
      </div>

      <div className="court-map-attribution">
        © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors
      </div>
    </div>
  );
}

function createMapView(points: CourtMapPoint[], variant: "preview" | "full"): MapView {
  const coordinates = points
    .map((point) => ({ latitude: point.latitude, longitude: point.longitude }))
    .filter((coordinate): coordinate is { latitude: number; longitude: number } => {
      return coordinate.latitude != null && coordinate.longitude != null;
    });

  if (!coordinates.length) {
    return {
      center: FALLBACK_CENTER,
      zoom: variant === "full" ? 11 : 10,
    };
  }

  const viewportCoordinates = pickViewportCluster(coordinates);
  const center = {
    latitude: average(viewportCoordinates.map((coordinate) => coordinate.latitude)),
    longitude: average(viewportCoordinates.map((coordinate) => coordinate.longitude)),
  };
  const latSpan =
    Math.max(...viewportCoordinates.map((coordinate) => coordinate.latitude)) -
    Math.min(...viewportCoordinates.map((coordinate) => coordinate.latitude));
  const lngSpan =
    Math.max(...viewportCoordinates.map((coordinate) => coordinate.longitude)) -
    Math.min(...viewportCoordinates.map((coordinate) => coordinate.longitude));
  const span = Math.max(latSpan, lngSpan);

  let zoom = variant === "full" ? 12 : 10;
  if (span > 8) zoom = 5;
  else if (span > 3) zoom = 6;
  else if (span > 1.5) zoom = 7;
  else if (span > 0.8) zoom = 8;
  else if (span > 0.35) zoom = 9;
  else if (span > 0.16) zoom = 10;
  else if (span > 0.07) zoom = 11;
  else if (span > 0.03) zoom = 12;

  return { center, zoom };
}

function normalizeInitialView(view: MapView | undefined): MapView | null {
  if (!view) return null;
  return {
    center: {
      latitude: Math.max(-85, Math.min(85, view.center.latitude)),
      longitude: normalizeMapLongitude(view.center.longitude),
    },
    zoom: clampZoom(view.zoom),
  };
}

function zoomView(view: MapView, delta: number, size: MapSize, anchor?: { x: number; y: number }): MapView {
  const nextZoom = clampZoom(view.zoom + delta);
  if (nextZoom === view.zoom) return view;
  if (!size.width || !size.height) {
    return {
      ...view,
      zoom: nextZoom,
    };
  }

  const anchorPoint = anchor ?? { x: size.width / 2, y: size.height / 2 };
  const currentCenter = latLngToWorld(view.center.latitude, view.center.longitude, view.zoom);
  const anchorWorldBefore = {
    x: currentCenter.x - size.width / 2 + anchorPoint.x,
    y: currentCenter.y - size.height / 2 + anchorPoint.y,
  };
  const anchorLatLng = worldToLatLng(anchorWorldBefore.x, anchorWorldBefore.y, view.zoom);
  const anchorWorldAfter = latLngToWorld(anchorLatLng.latitude, anchorLatLng.longitude, nextZoom);
  const nextCenterWorld = {
    x: anchorWorldAfter.x - anchorPoint.x + size.width / 2,
    y: anchorWorldAfter.y - anchorPoint.y + size.height / 2,
  };

  return {
    center: worldToLatLng(nextCenterWorld.x, nextCenterWorld.y, nextZoom),
    zoom: nextZoom,
  };
}

function clampZoom(zoom: number) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

function pickViewportCluster(coordinates: { latitude: number; longitude: number }[]) {
  if (coordinates.length < 4) return coordinates;

  const clusters = coordinates.map((origin) =>
    coordinates.filter((coordinate) => {
      return (
        Math.abs(coordinate.latitude - origin.latitude) <= 1.2 &&
        Math.abs(coordinate.longitude - origin.longitude) <= 1.2
      );
    }),
  );
  const largestCluster = clusters.reduce((largest, cluster) => (cluster.length > largest.length ? cluster : largest), clusters[0]);

  return largestCluster.length >= Math.ceil(coordinates.length * 0.6) ? largestCluster : coordinates;
}

function createTiles(view: MapView, size: MapSize) {
  if (!size.width || !size.height) return [];

  const center = latLngToWorld(view.center.latitude, view.center.longitude, view.zoom);
  const startX = center.x - size.width / 2;
  const startY = center.y - size.height / 2;
  const minTileX = Math.floor(startX / TILE_SIZE);
  const maxTileX = Math.floor((startX + size.width) / TILE_SIZE);
  const minTileY = Math.floor(startY / TILE_SIZE);
  const maxTileY = Math.floor((startY + size.height) / TILE_SIZE);
  const tileCount = 2 ** view.zoom;
  const tiles = [];

  for (let x = minTileX; x <= maxTileX; x += 1) {
    for (let y = minTileY; y <= maxTileY; y += 1) {
      if (y < 0 || y >= tileCount) continue;
      const wrappedX = ((x % tileCount) + tileCount) % tileCount;
      tiles.push({
        x,
        y,
        zoom: view.zoom,
        left: Math.round(x * TILE_SIZE - startX),
        top: Math.round(y * TILE_SIZE - startY),
        url: TILE_URL.replace("{z}", String(view.zoom)).replace("{x}", String(wrappedX)).replace("{y}", String(y)),
      });
    }
  }

  return tiles;
}

function projectMarkers(points: CourtMapPoint[], view: MapView, size: MapSize) {
  if (!size.width || !size.height) return [];

  const center = latLngToWorld(view.center.latitude, view.center.longitude, view.zoom);
  const startX = center.x - size.width / 2;
  const startY = center.y - size.height / 2;

  return points
    .filter((point): point is CourtMapPoint & { latitude: number; longitude: number } => {
      return point.latitude != null && point.longitude != null;
    })
    .map((point) => {
      const world = latLngToWorld(point.latitude, point.longitude, view.zoom);
      return {
        point,
        left: Math.round(world.x - startX),
        top: Math.round(world.y - startY),
      };
    });
}

function createViewport(view: MapView, size: MapSize): CourtMapViewport {
  const center = latLngToWorld(view.center.latitude, view.center.longitude, view.zoom);
  const topLeft = worldToLatLng(center.x - size.width / 2, center.y - size.height / 2, view.zoom);
  const bottomRight = worldToLatLng(center.x + size.width / 2, center.y + size.height / 2, view.zoom);

  return {
    center: view.center,
    bounds: {
      north: Math.max(topLeft.latitude, bottomRight.latitude),
      south: Math.min(topLeft.latitude, bottomRight.latitude),
      west: topLeft.longitude,
      east: bottomRight.longitude,
    },
    zoom: view.zoom,
  };
}

function latLngToWorld(latitude: number, longitude: number, zoom: number) {
  const sinLatitude = Math.sin((latitude * Math.PI) / 180);
  const scale = TILE_SIZE * 2 ** zoom;

  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * scale,
  };
}

function worldToLatLng(x: number, y: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const longitude = (x / scale) * 360 - 180;
  const latitudeRadians = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / scale)));
  const latitude = (latitudeRadians * 180) / Math.PI;

  return {
    latitude: Math.max(-85, Math.min(85, latitude)),
    longitude: ((((longitude + 180) % 360) + 360) % 360) - 180,
  };
}

function normalizeMapLongitude(longitude: number) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

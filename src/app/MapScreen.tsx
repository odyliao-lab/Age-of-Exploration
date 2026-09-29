import { useEffect, useMemo, useRef, useState } from 'react';
import type { ContentBundle, LonLat } from '@/data/schema';
import { formatLonLat } from '@/map/projection';
import { WorldMap, type PortMarker } from '@/map/WorldMap';
import { useGame } from './store';

const HOME_ZOOM = 5;

export function MapScreen({ content }: { content: ContentBundle }) {
  const scenarioId = useGame((s) => s.scenarioId);
  const selectedPortId = useGame((s) => s.selectedPortId);
  const selectPort = useGame((s) => s.selectPort);
  const backToMenu = useGame((s) => s.backToMenu);

  const scenario = content.scenarios.find((s) => s.id === scenarioId)!;
  const homePort = content.ports.find((p) => p.id === scenario.home_port)!;

  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<WorldMap | null>(null);
  const [pointer, setPointer] = useState<LonLat | null>(null);
  const [ready, setReady] = useState(false);

  const markers = useMemo<PortMarker[]>(
    () =>
      content.ports.map((p) => ({
        id: p.id,
        label: p.name,
        location: p.location,
        kind: p.kind,
        home: p.id === scenario.home_port,
      })),
    [content.ports, scenario.home_port],
  );

  useEffect(() => {
    const host = hostRef.current!;
    let cancelled = false;
    let map: WorldMap | null = null;
    WorldMap.create(host, {
      ports: markers,
      onSelectPort: (id) => useGame.getState().selectPort(id),
      onPointerLonLat: setPointer,
    }).then((m) => {
      if (cancelled) {
        m.destroy();
        return;
      }
      map = m;
      mapRef.current = m;
      m.centerOn(homePort.location, HOME_ZOOM);
      m.setSelected(useGame.getState().selectedPortId);
      setReady(true);
    });
    return () => {
      cancelled = true;
      map?.destroy();
      mapRef.current = null;
    };
  }, [markers, homePort.location]);

  useEffect(() => {
    mapRef.current?.setSelected(selectedPortId);
  }, [selectedPortId, ready]);

  const port = content.ports.find((p) => p.id === selectedPortId) ?? null;
  const region = port ? content.regions.find((r) => r.id === port.region) : null;
  const tier = port ? scenario.region_tiers[port.region] : undefined;
  const goods = port
    ? port.goods.map((g) => content.codex.find((c) => c.id === g)).filter((c) => c !== undefined)
    : [];

  return (
    <div className="map-screen">
      <header className="map-toolbar">
        <button type="button" onClick={backToMenu}>
          ← 劇本選單
        </button>
        <strong className="map-title">{scenario.name}</strong>
        <div className="map-actions">
          <button type="button" aria-label="縮小" onClick={() => mapRef.current?.zoomBy(1 / 1.5)}>
            −
          </button>
          <button type="button" aria-label="放大" onClick={() => mapRef.current?.zoomBy(1.5)}>
            ＋
          </button>
          <button
            type="button"
            onClick={() => mapRef.current?.centerOn(homePort.location, HOME_ZOOM)}
          >
            回到{homePort.name}
          </button>
        </div>
      </header>

      <div className="map-host" ref={hostRef} />

      <div className="map-legend" aria-hidden="true">
        <span>
          <i className="dot home" />
          家鄉港口
        </span>
        <span>
          <i className="dot" />
          港口
        </span>
        <span>
          <i className="line" />
          赤道、本初子午線
        </span>
      </div>

      <div className="map-coords" aria-live="off">
        {pointer ? formatLonLat(pointer) : '滑過或拖曳地圖可查看經緯度'}
      </div>

      {port && (
        <aside className="port-panel" aria-label={`${port.name} 港口資訊`}>
          <button
            type="button"
            className="close"
            aria-label="關閉"
            onClick={() => selectPort(null)}
          >
            ×
          </button>
          <h2>
            {port.name}
            <span className="en">{port.name_en}</span>
          </h2>
          {port.historical_names.length > 0 && (
            <div className="meta">舊稱：{port.historical_names.join('、')}</div>
          )}
          <div className="meta">
            {port.country}（{port.country_en}）· {region?.name}
            {tier !== undefined && ` · Tier ${tier}`}
          </div>
          <div className="meta">{formatLonLat(port.location, 2)}</div>
          {port.climate && <div className="meta">氣候：{port.climate}</div>}
          {port.blurb && <p>{port.blurb}</p>}
          {goods.length > 0 && (
            <div className="meta">特產：{goods.map((g) => g.name).join('、')}</div>
          )}
          {port.id === homePort.id && <div className="home-tag">你的家鄉港口</div>}
        </aside>
      )}
    </div>
  );
}

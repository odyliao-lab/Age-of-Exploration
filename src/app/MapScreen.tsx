import { useEffect, useMemo, useRef, useState } from 'react';
import type { LonLat } from '@/data/schema';
import { formatLonLat } from '@/map/projection';
import { WorldMap, type PortMarker, type RouteView } from '@/map/WorldMap';
import {
  activeNavigateTargets,
  pendingInteraction,
  portNameKnown,
  visiblePortIds,
} from '@/game/state';
import { positionAt } from '@/game/voyage';
import { onFogChange, useGame } from './store';
import { PortPanel } from './panels/PortPanel';
import { PlanningPanel } from './panels/PlanningPanel';
import { SailBar } from './panels/SailBar';
import { QuestTracker } from './panels/QuestTracker';
import { Toasts } from './panels/Toasts';
import { DialogueModal, EventModal, QuizModal, RewardModal, StormModal } from './panels/Modals';
import { LocateBanner } from './panels/LocateBanner';
import { WindCompass } from './panels/WindCompass';
import { CodexPanel } from './panels/CodexPanel';
import { CaptainPanel } from './panels/CaptainPanel';
import { StatusBar } from './panels/StatusBar';

const HOME_ZOOM = 5;

export function MapScreen() {
  const world = useGame((s) => s.world)!;
  const game = useGame((s) => s.game)!;
  const selectedPortId = useGame((s) => s.selectedPortId);
  const planning = useGame((s) => s.planning);
  const follow = useGame((s) => s.follow);
  const modals = useGame((s) => s.modals);
  const panel = useGame((s) => s.panel);
  const mapMarks = useGame((s) => s.mapMarks);

  const scenario = world.scenarios.get(game.scenarioId)!;
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<WorldMap | null>(null);
  const [pointer, setPointer] = useState<LonLat | null>(null);
  const [ready, setReady] = useState(false);

  // ---- 建立與銷毀渲染器
  useEffect(() => {
    const host = hostRef.current!;
    let cancelled = false;
    let map: WorldMap | null = null;
    let offFog: (() => void) | null = null;
    WorldMap.create(host, {
      onPortTap: (id) => {
        const s = useGame.getState();
        if (s.planning) {
          const port = s.world!.ports.get(id)!;
          s.addWaypoint(port.location, id);
        } else {
          s.selectPort(id);
        }
      },
      onMapTap: (p) => {
        const s = useGame.getState();
        const pending = s.world && s.game ? pendingInteraction(s.world, s.game) : null;
        if (pending?.data.type === 'locate' && !s.modals.length) s.locate(p);
        else if (s.planning) s.addWaypoint(p);
        else s.selectPort(null);
      },
      onPointerLonLat: setPointer,
      onUserPan: () => useGame.getState().setFollow(false),
    }).then((m) => {
      if (cancelled) {
        m.destroy();
        return;
      }
      map = m;
      mapRef.current = m;
      const g = useGame.getState().game!;
      m.setFog(g.fog);
      offFog = onFogChange((changed) => {
        const cur = useGame.getState().game;
        if (!cur) return;
        if (changed === 'all') m.setFog(cur.fog);
        else m.revealFog(changed);
      });
      m.centerOn(g.ship.position, HOME_ZOOM);
      // 網址加上 ?debug 時開放給自動化測試
      if (new URLSearchParams(location.search).has('debug')) {
        Object.assign(window, { __aoeMap: m, __aoeStore: useGame });
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
      offFog?.();
      map?.destroy();
      mapRef.current = null;
    };
  }, []);

  // ---- 時間推進
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      useGame.getState().advance((now - last) / 1000);
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---- 港口標記
  const markers = useMemo<PortMarker[]>(() => {
    const targets = activeNavigateTargets(world, game);
    return visiblePortIds(world, game).map((id) => {
      const p = world.ports.get(id)!;
      const target = targets.find((t) => t.portId === id);
      return {
        id,
        label: portNameKnown(world, game, id) ? p.name : '？',
        location: p.location,
        kind: p.kind,
        home: id === scenario.home_port,
        target: !!target && target.hintLevel <= 1,
      };
    });
    // 只在港口相關狀態改變時重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, game.quests, game.visitedPorts, game.unlockedPorts, scenario.home_port]);

  useEffect(() => {
    if (ready) mapRef.current?.setPorts(markers);
  }, [markers, ready]);

  useEffect(() => {
    if (ready) mapRef.current?.setSelected(selectedPortId);
  }, [selectedPortId, ready]);

  // ---- 船與航線
  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !m) return;
    m.setShip(game.ship.position, game.ship.heading, follow && !!game.voyage);
    if (planning) {
      m.setRoute({
        done: [],
        ahead: planning.waypoints,
        planning: true,
        invalidAt: planning.invalidAt,
      });
    } else if (game.voyage) {
      const v = game.voyage;
      const pos = positionAt(v, v.traveledKm);
      const route: RouteView = {
        done: [...v.waypoints.slice(0, pos.legIndex + 1), pos.position],
        ahead: [pos.position, ...v.waypoints.slice(pos.legIndex + 1)],
        planning: false,
      };
      m.setRoute(route);
    } else {
      m.setRoute(null);
    }
  }, [game.ship, game.voyage, planning, follow, ready]);

  useEffect(() => {
    if (ready) mapRef.current?.setMarks(mapMarks);
  }, [mapMarks, ready]);

  const interaction = modals.length === 0 ? pendingInteraction(world, game) : null;
  const locating = interaction?.data.type === 'locate';

  useEffect(() => {
    mapRef.current?.setPlanning(!!planning || locating);
  }, [planning, locating]);

  return (
    <div className={locating ? 'map-screen locating' : 'map-screen'}>
      <StatusBar
        onZoomIn={() => mapRef.current?.zoomBy(1.5)}
        onZoomOut={() => mapRef.current?.zoomBy(1 / 1.5)}
        onFindShip={() => {
          useGame.getState().setFollow(true);
          mapRef.current?.centerOn(useGame.getState().game!.ship.position);
        }}
      />

      <div className="map-area">
        <div className="map-host" ref={hostRef} />

        <QuestTracker />

        <div className="map-legend" aria-hidden="true">
          <span>
            <i className="dot home" />
            家鄉
          </span>
          <span>
            <i className="dot target" />
            任務目的地
          </span>
          <span>
            <i className="line" />
            赤道、本初子午線
          </span>
          <span>
            <i className="line dashed" />
            回歸線、極圈
          </span>
        </div>

        <div className="map-coords" aria-live="off">
          {pointer ? formatLonLat(pointer) : '滑過或拖曳地圖可查看經緯度'}
        </div>

        {planning ? <PlanningPanel /> : game.voyage ? <SailBar /> : null}
        {!planning && selectedPortId && <PortPanel portId={selectedPortId} />}

        <WindCompass />
        {interaction?.data.type === 'locate' && <LocateBanner step={interaction.data} />}
        <Toasts />
      </div>

      {panel === 'codex' && <CodexPanel />}
      {panel === 'captain' && <CaptainPanel />}

      {modals[0] && <RewardModal modal={modals[0]} />}
      {!modals[0] && game.encounter?.kind === 'storm' && <StormModal encounter={game.encounter} />}
      {!modals[0] && game.encounter?.kind === 'event' && (
        <EventModal event={game.encounter} key={`${game.encounter.id}-${game.day}`} />
      )}
      {interaction?.data.type === 'dialogue' && (
        <DialogueModal questId={interaction.questId} step={interaction.data} />
      )}
      {interaction?.data.type === 'quiz' && (
        <QuizModal
          questId={interaction.questId}
          step={interaction.data}
          key={interaction.questId + interaction.step}
        />
      )}
    </div>
  );
}

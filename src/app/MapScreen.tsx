import { useEffect, useMemo, useRef, useState } from 'react';
import { COLORS, HULL_PAINTS, SAIL_PAINTS, colorOf } from '@/game/cosmetics';
import type { LonLat } from '@/data/schema';
import { formatLonLat } from '@/map/projection';
import { WorldMap, type PortMarker, type RouteView } from '@/map/WorldMap';
import {
  activeNavigateTargets,
  pendingInteraction,
  portNameKnown,
  positionErrorKm,
  sailingStatus,
  visiblePortIds,
} from '@/game/state';
import { darkness } from '@/game/navigation';
import { insideMist, insideStorm } from '@/game/encounters';
import { bearingDeg } from '@/geo/geo';
import { positionAt } from '@/game/voyage';
import { isDebug } from './debug';
import { onFogChange, useGame } from './store';
import { PortPanel } from './panels/PortPanel';
import { PlanningPanel } from './panels/PlanningPanel';
import { SailBar } from './panels/SailBar';
import { HelmPanel } from './panels/HelmPanel';
import { StarSightModal } from './panels/StarSightModal';
import { CoastSightModal } from './panels/CoastSightModal';
import { TownView } from './town/TownView';
import { BuildingPanel } from './town/BuildingPanel';
import { cultureOf } from '@/town/layout';
import { folkLines } from '@/town/folkTalk';
import { QuestTracker } from './panels/QuestTracker';
import { Toasts } from './panels/Toasts';
import { DialogueModal, EventModal, QuizModal, RewardModal, StormModal } from './panels/Modals';
import { LocateBanner } from './panels/LocateBanner';
import { WindCompass } from './panels/WindCompass';
import { CodexPanel } from './panels/CodexPanel';
import { CaptainPanel } from './panels/CaptainPanel';
import { FleetPanel } from './panels/FleetPanel';
import { LogbookPanel } from './panels/LogbookPanel';
import { StatusBar } from './panels/StatusBar';

const HOME_ZOOM = 5;
/** 親手駕船時的鏡頭：約 4–6 度見方 */
const SAIL_ZOOM = 30;

export function MapScreen() {
  const world = useGame((s) => s.world)!;
  const game = useGame((s) => s.game)!;
  const selectedPortId = useGame((s) => s.selectedPortId);
  const planning = useGame((s) => s.planning);
  const follow = useGame((s) => s.follow);
  const modals = useGame((s) => s.modals);
  const panel = useGame((s) => s.panel);
  const mapMarks = useGame((s) => s.mapMarks);
  const townView = useGame((s) => s.townView);
  const building = useGame((s) => s.building);
  const lastBuilding = useGame((s) => s.lastBuilding);
  const stargazing = useGame((s) => s.stargazing);
  const coastSight = useGame((s) => s.coastSight);

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
        } else if (s.game?.helm) {
          // 航行中點港口：船頭轉向那個港口
          const port = s.world!.ports.get(id)!;
          s.steer(bearingDeg(s.game.ship.position, port.location));
        } else {
          s.selectPort(id);
        }
      },
      onMapTap: (p) => {
        const s = useGame.getState();
        const pending = s.world && s.game ? pendingInteraction(s.world, s.game) : null;
        if (pending?.data.type === 'locate' && !s.modals.length) s.locate(p);
        else if (s.planning) s.addWaypoint(p);
        else if (s.game?.helm) s.steer(bearingDeg(s.game.ship.position, p));
        else s.selectPort(null);
      },
      onPointerLonLat: setPointer,
      onPlaceTap: (id) => useGame.getState().openPanel('codex', id),
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
      if (isDebug()) {
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

  // ---- 船隻配色
  const look = game.appearance;
  useEffect(() => {
    if (!ready) return;
    const hex = (c: string) => parseInt(c.slice(1), 16);
    mapRef.current?.setShipStyle({
      hull: hex(colorOf(HULL_PAINTS, look.hull)),
      sail: hex(colorOf(SAIL_PAINTS, look.sail)),
      flag: hex(colorOf(COLORS, look.flagColor)),
    });
  }, [ready, look.hull, look.sail, look.flagColor]);

  // ---- 船與航線
  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !m) return;
    m.setShip(game.ship.position, game.ship.heading, follow && (!!game.voyage || !!game.helm));
    const st = sailingStatus(world, game);
    m.setSailing(
      st && game.helm
        ? {
            windToward: st.wind.toward,
            windStrength: st.wind.strength,
            windRel: st.windRel,
            angleOffWind: st.angleOffWind,
            sail: game.helm.anchored ? 0 : game.helm.sail,
            moving: st.motion.speed > 1,
            course: game.helm.course,
          }
        : null,
    );
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
  }, [game.ship, game.voyage, game.helm, planning, follow, ready, world, game]);

  // ---- 海上的船隊、風暴、日夜與位置誤差
  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !m) return;
    const g = game;
    m.setFleets(
      g.helm
        ? g.fleets.map((f) => ({
            id: f.id,
            kind: f.kind,
            position: f.position,
            heading: f.heading,
            chasing: f.mode === 'chase',
          }))
        : [],
    );
    m.setStorms(
      g.helm
        ? g.storms.map((c) => ({ id: c.id, center: c.center, radiusKm: c.radiusKm, name: c.name }))
        : [],
    );
    m.setMists(
      g.helm ? g.mists.map((c) => ({ id: c.id, center: c.center, radiusKm: c.radiusKm })) : [],
    );
    m.setPositionError(g.helm ? g.ship.position : null, g.helm ? positionErrorKm(world, g) : 0);
    m.setSky(
      g.helm ? darkness(g.day) : 0,
      !!g.helm && !!insideStorm(g.storms, g.ship.position),
      !!g.helm && !!insideMist(g.mists, g.ship.position),
    );
  }, [ready, world, game]);

  // ---- 出港時拉近鏡頭跟著船，入港時拉遠一些看港口周邊
  const atSea = !!game.helm;
  useEffect(() => {
    const m = mapRef.current;
    if (!ready || !m) return;
    const pos = useGame.getState().game!.ship.position;
    m.centerOn(pos, atSea ? SAIL_ZOOM : HOME_ZOOM * 2);
  }, [atSea, ready]);

  useEffect(() => {
    if (ready) mapRef.current?.setMarks(mapMarks);
  }, [mapMarks, ready]);

  // ---- 已發現地點的地名註記（親手畫出的海圖）
  const discovered = game.discovered;
  useEffect(() => {
    if (!ready) return;
    mapRef.current?.setPlaces(
      discovered
        .map((id) => world.codex.get(id))
        .filter((c) => !!c?.location && c.category !== 'goods')
        .map((c) => ({ id: c!.id, name: c!.name, location: c!.location!, category: c!.category })),
    );
  }, [ready, world, discovered]);

  const interaction = modals.length === 0 ? pendingInteraction(world, game) : null;
  const locating = interaction?.data.type === 'locate';

  useEffect(() => {
    mapRef.current?.setPlanning(!!planning || locating);
  }, [planning, locating]);

  // 停泊時預設在城鎮裡走動；定位挑戰需要海圖時自動切回海圖
  const dockedPort =
    !game.helm && !game.voyage && game.dockedAt ? world.ports.get(game.dockedAt) : null;
  const showTown = !!dockedPort && townView && !locating && !planning;
  const culture = dockedPort ? cultureOf(dockedPort.country) : 'minnan';
  const shipColors = {
    hull: colorOf(HULL_PAINTS, look.hull),
    sail: colorOf(SAIL_PAINTS, look.sail),
    flag: colorOf(COLORS, look.flagColor),
  };

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

        {showTown && (
          <>
            <TownView
              key={dockedPort!.id}
              culture={culture}
              appearance={game.appearance}
              ship={shipColors}
              returnFrom={lastBuilding}
              talk={folkLines(dockedPort!.id, culture, dockedPort!.gossip)}
              onEnter={(kind) => useGame.getState().enterBuilding(kind)}
            />
            <div className="town-hint">
              點地面走路，點路人聊天；走到門口進入建築，走到船邊可以補給、出港。
            </div>
          </>
        )}
        {dockedPort && !locating && !planning && (
          <button
            type="button"
            className={showTown ? 'view-toggle in-town' : 'view-toggle on-chart'}
            onClick={() => useGame.getState().setTownView(!townView)}
          >
            {showTown ? '🗺️ 看海圖' : `🏘️ 回到${dockedPort.name}城裡`}
          </button>
        )}

        <QuestTracker />

        <div className="map-legend" aria-hidden="true" hidden={atSea}>
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

        {planning ? (
          <PlanningPanel />
        ) : game.voyage ? (
          <SailBar />
        ) : game.helm ? (
          <HelmPanel />
        ) : null}

        {!game.helm && !showTown && <WindCompass />}
        {interaction?.data.type === 'locate' && <LocateBanner step={interaction.data} />}
        <Toasts />
      </div>

      {/* 港口面板放在海圖區塊之外：手機版排在海圖下方，避免可捲動面板疊在 WebGL 畫布上造成空白 */}
      {!planning && !showTown && selectedPortId && <PortPanel portId={selectedPortId} />}
      {showTown && building && <BuildingPanel kind={building} culture={culture} />}
      {stargazing && game.helm && <StarSightModal />}
      {coastSight && game.helm && <CoastSightModal />}

      {panel === 'codex' && <CodexPanel />}
      {panel === 'captain' && <CaptainPanel />}
      {panel === 'fleet' && <FleetPanel />}
      {panel === 'logbook' && <LogbookPanel />}

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

export function insertScene(scenes, scene) {
  return [...scenes, scene];
}

export function removeSceneById(scenes, id) {
  return scenes.filter((s) => s.id !== id);
}

export function addSourceToScene(scenes, sceneId, source) {
  return scenes.map((scene) => scene.id === sceneId ? { ...scene, sources: [...scene.sources, source] } : scene);
}

export function removeSourceFromScene(scenes, sceneId, sourceId) {
  return scenes.map((scene) => scene.id === sceneId ? { ...scene, sources: scene.sources.filter((s) => s.id !== sourceId) } : scene);
}

export function toggleSourceVisibilityInScene(scenes, sceneId, sourceId) {
  return scenes.map((scene) => scene.id === sceneId ? { ...scene, sources: scene.sources.map((s) => s.id === sourceId ? { ...s, visible: !s.visible } : s) } : scene);
}

export function moveSourceInScene(scenes, sceneId, sourceId, direction) {
  return scenes.map((scene) => {
    if (scene.id !== sceneId) return scene;
    const index = scene.sources.findIndex((s) => s.id === sourceId);
    const nextIndex = index + direction;
    if (index === -1 || nextIndex < 0 || nextIndex >= scene.sources.length) return scene;
    const next = [...scene.sources];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    return { ...scene, sources: next };
  });
}

export function updateSourceFieldInScene(scenes, sceneId, sourceId, field, value) {
  return scenes.map((scene) => scene.id === sceneId ? { ...scene, sources: scene.sources.map((s) => s.id === sourceId ? { ...s, [field]: value } : s) } : scene);
}

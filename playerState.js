export function deriveState({enabled, owner, dismissedOwner}) {
    if (!owner)
        return 'no-player';
    if (!enabled)
        return 'disabled';
    if (owner === dismissedOwner)
        return 'dismissed';
    return 'available';
}

export function cornerLayout(monitor, panelWidth, panelHeight, side = 'left') {
    const margin = 12;
    const edgeWidth = 18;
    const barrierY2 = monitor.y + monitor.height - margin;
    const right = side === 'right';
    const monitorRight = monitor.x + monitor.width;

    return {
        panelX: right
            ? monitorRight - panelWidth - margin
            : monitor.x + margin,
        panelY: barrierY2 - panelHeight,
        hiddenX: right ? panelWidth + margin * 2 : -(panelWidth + margin * 2),
        barrierX: right ? monitorRight - 1 : monitor.x,
        barrierY1: barrierY2 - 72,
        barrierY2,
        edgeX1: right ? monitorRight - edgeWidth : monitor.x,
        edgeX2: right ? monitorRight : monitor.x + edgeWidth,
    };
}

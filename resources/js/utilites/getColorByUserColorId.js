const BACKGROUNDS = {
    1: '#EDEB52',
    2: '#EE3634',
    3: '#3C5FA1',
    4: '#EE5E81',
    5: 'black',
    6: 'white',
}
export const COLORS_IDENTITY = 4
export function colorOf(identity) {
    const key = String(identity ?? '').toLowerCase()
    let h = 0
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
    return (h % COLORS_IDENTITY) + 1
}

export function themeColorOf(colorId) {
    const background = BACKGROUNDS[colorId] ?? BACKGROUNDS[1]
    return background === 'black' ? '#CCCCCC' : background
}

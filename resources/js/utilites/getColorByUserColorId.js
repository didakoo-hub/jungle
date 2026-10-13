import iconaplayB from '../../images/extra_objects/iconaplayB.svg'
import iconaplayW from '../../images/extra_objects/iconaplayW.svg'

const colorIdData = {
    1: {
        borderStyle: '3px solid yellow',
        backgroundBord: '#EDEB52',
        boardColorAvatar: '#FFFF00',
        colorAddress: 'black',
        colorPower: 'black',
        avatarSrc: iconaplayB,
        textDecorationAddress: 'black',
    },
    2: {
        borderStyle: '3px solid red',
        backgroundBord: '#EE3634',
        boardColorAvatar: '#FF0000',
        colorAddress: 'black',
        colorPower: 'black',
        avatarSrc: iconaplayB,
        textDecorationAddress: 'black',
    },
    3: {
        borderStyle: '3px solid blue',
        backgroundBord: '#3C5FA1',
        boardColorAvatar: '#0000FF',
        colorAddress: 'white',
        colorPower: 'white',
        avatarSrc: iconaplayW,
        textDecorationAddress: 'white',
    },
    4: {
        borderStyle: '3px solid #EE5E81',
        backgroundBord: '#EE5E81',
        boardColorAvatar: '#ee5e81',
        colorAddress: 'black',
        colorPower: 'black',
        avatarSrc: iconaplayB,
        textDecorationAddress: 'black',
    },
    5: {
        borderStyle: '3px solid black',
        backgroundBord: 'black',
        colorAddress: 'white',
        colorPower: 'white',
        avatarSrc: iconaplayW,
        textDecorationAddress: 'white',
    },
    6: {
        borderStyle: '3px solid white',
        backgroundBord: 'white',
        colorAddress: 'black',
        colorPower: 'black',
        avatarSrc: iconaplayB,
        textDecorationAddress: 'black',
    },
}
export const COLORS_IDENTITY = 4
export function colorOf(identity) {
    const key = String(identity ?? '').toLowerCase()
    let h = 0
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
    return (h % COLORS_IDENTITY) + 1
}
export function getColorStyles(colorId) {
    if (colorIdData[colorId]) {
        return colorIdData[colorId];
    } else {
        const randomKey =  1
        return colorIdData[randomKey]
    }
}

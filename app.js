const express = require('express')
const app = express()
const server = require('http').Server(app)
const io = require('socket.io')(server)

app.use(express.static('./DiCon2018'))

server.listen(process.env.PORT || 8080)

//----------------------------------------------------------------------------------------------------------------------------------------------------------------------------//

const game = {
    users: [],
    rooms: []
}

createNewRoom(1)

io.set('origins', '*:*')
io.on('connection', socket => {
    socket.on("getRoomList", data => sendRoomList(socket.id))
    socket.on("join", data => join(data.access, socket.id, data.roomid))
    socket.on("update", data => updateUser(socket.id, data))
    socket.on("died", data => userDied(data.target))
    socket.on("disconnect", data => userDisconnected(socket.id))
    socket.on("chatPost", data => chatPosted(getUser(roomid), data))
    socket.on("addTail", data => io.to(data.target).emit("addTail"))
})

setInterval(() => {
    monitoring()
    sendGameData()
    checkGameOver()
    garbageCollect()
}, 100)

//----------------------------------------------------------------------------------------------------------------------------------------------------------------------------//

function sendRoomList(id) {
    io.to(id).emit("roomList", {rooms: game.rooms})
}

function join(access, id, roomid) {
    if (access == 1) {
	let roomIndex = game.rooms.findIndex(element => element.status == 0 && element.option.access == 1)
	if (game.users.find(element => element.id == id) == undefined) {
	     game.users.push({x: 0, y: 0, id: id, rotation: 0, tail: [], roomid: roomIndex, isDead: false, username: ""})
	} else {
	     game.users[getUserIndex(id)].roomid = roomIndex
	     game.users[getUserIndex(id)].isDead = false
	}

	if (getRoomSNumberOfUser(roomIndex) == 4 || roomIndex == -1) {	   
            startGame(roomIndex)
            if (game.rooms.findIndex(element => element.status == 0 && element.option.access == 1) == -1)
		createNewRoom()
	}
    } else {
	if (game.rooms[roomid].status == 0) {
	    game.users.push({x: 0, y:0, id: id, rotation: 0, tail: [], roomid: roomid, isDead: false, username: ""})
	    if (getRoomSNumberOfUser(roomid) == game.rooms[roomid].option.numberOfUsers)
		startGame(roomid)
	} else {
	    io.to(id).emit("full")
	}
    }
}

function updateUser(id, data) {
    let userIndex = getUserIndex(id)
    game.users[userIndex] = data
    game.users[userIndex].id = id
}

function userDied(target) {
    emitMessagesToUsers(getRoomSUserList(getUser(target).roomid), "died", {id: target, x: getUser(target).x, y: getUser(target).y})
    let hunter = game.rooms[getUser(target).roomid].foodchain.find(element => element.target == target).hunter

    game.rooms[getUser(target).roomid].foodchain.splice(game.rooms[getUser(target).roomid].foodchain.findIndex(element => element.target == target), 1)
    game.rooms[getUser(target).roomid].foodchain[game.rooms[getUser(target).roomid].foodchain.findIndex(element => element.hunter == target)].hunter = hunter   
    game.users[getUserIndex(target)].isDead = true
}

function userDisconnected(id) {
    let user = getUser(id)
    if (user == undefined) return;

    if (user.roomid >= 0 && game.rooms[user.roomid].status == 1)
	userDied(id)
    removeUser(id)
}

function chatPosted(roomid, data) {
    game.rooms[roomid].chat.unshift(data)
    if(game.rooms[roomid].chat.length > 10)
	game.rooms[roomid].chat.pop()
}

function monitoring() {
    console.log(game)
}

function sendGameData() {
    game.users.forEach(element => io.to(element.id).emit("update", { 
	users: getRoomSUserList(getUser(element.id).roomid),
	room: game.rooms[element.roomid]
    }))
}

function checkGameOver() {
    game.rooms.forEach((element, index) => {	
	if (isGameOver(index)) userWon(game.users.find(element => element.roomid == index && element.isDead == false))	
    })
}

function garbageCollect() {
    if (game.rooms.length < 2)
	return;

    if (game.rooms[game.rooms.length - 1].status == 0 && game.rooms.filter((element, index) => getRoomSNumberOfUser(index) == 0).length > 1)
	game.rooms.splice(game.rooms.length - 1, 1)
}

function userWon(winner) {
    clearRoom(winner.roomid)
    getRoomSUserList(winner.roomid).forEach(element => {
	game.users[game.users.findIndex(element => element.roomid != -2)].roomid = -2
	if (game.users.findIndex(element => element.isDead != false != -1))
	     game.users[game.users.findIndex(element => element.isDead != false)].isDead = false
    })
    emitMessagesToUsers(getRoomSUserList(winner.roomid), "gameEnd", {winner: winner})
    game.users.filter(element => element.roomid == winner.roomid).forEach(element => game.users[getUserIndex(element.id)].roomid = -2) 
}

function startGame(roomid) {
    game.rooms[roomid].status = 1
    game.rooms[roomid].foodchain = makeFoodchain(game.users, roomid)
    setObjects(roomid)
    setTimeout(function() { emitMessagesToUsers(getRoomSUserList(roomid), "gameStart", game.rooms[roomid])}, 500)
} 

function setObjects(roomid) {
    for (let i = 0; i < 20; i++)
	putObject(getRandomNumber(0, 2400), getRandomNumber(0, 2400), roomid)

    putSpecialObjects(roomid)
}

function putObject(x, y, roomid) {
    game.rooms[roomid].objects.push({x: x, y: y, type: 0, rotation: getRandomNumber(Math.PI * -100000, Math.PI * 100000) / 100000, size: getRandomNumber(3, 13) / 10})
}

function putSpecialObjects (roomid) {

}

function makeFoodchain(users, roomid) {
    let foodchain = []
    let userlist = getRoomSUserList(roomid)

    for (let i=0; i<userlist.length; i++) 
	foodchain.push({hunter: userlist[i].id, target: userlist[i != userlist.length - 1 ? i+1 : 0].id})
    return foodchain
}

function removeUser(id) {
    if (getRoomSNumberOfUser(-1) != 0 && getUser(id).roomid != -1 && game.rooms[0].status == 0)
	game.users[game.users.findIndex(element => element.roomid == -1)].roomid = 0

    game.users.splice(getUserIndex(id), 1)
}

function emitMessagesToUsers(userList, messageName, messageData) {
    userList.forEach(element => io.to(element.id).emit(messageName, messageData))
}

function addMessage(roomid, userid, message) {
    game.rooms[roomid].push({userid: userid, message: message})
}

function createNewRoom(access) {
    game.rooms.push({status: 0, objects: [], foodchain: [], chat: [], option: {access: access, numberOfUsers: 4}, map: 0})
}

function clearRoom(roomid) {
    game.rooms[roomid] = {status: 0, objects: [], foodchain: [], chat: [], option: {access: 1, numberOfUsers: 4}, map: 0}
}

function getRoom(roomid) {
    return game.rooms.find(element => element.roomid == roomid)
}

function getRoomIndex(roomid) {
    return game.rooms.findIndex(element => element.roomid == roomid)
}

function getRoomSUserList(roomid) {
    return game.users.filter(element => element.roomid == roomid)
}

function getRoomSNumberOfUser(roomid) {
    return game.users.filter(element => element.roomid == roomid && !element.isDead).length
}

function getUserIndex(id) {
    return game.users.findIndex(element => element.id == id)
}

function getUser(id) {
    return game.users.find(element => element.id == id)
}

function isGameOver(roomid) {
    return game.users.filter(element => element.roomid == roomid && element.isDead == false).length == 1 && game.rooms[roomid].status == 1
}

function getRandomNumber(number1, number2) {
    return Math.floor((Math.random() * Math.abs(number1 - number2)) + (number1 > number2 ? number2 : number1))
}

function getDistanceBetween(x1, y1, x2, y2) {
    return Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2))
}

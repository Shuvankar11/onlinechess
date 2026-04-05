// --- FIREBASE SETUP ---
const firebaseConfig = {
    apiKey: "AIzaSyDsBQjIUDfsD9jChHnibX5Dqlyfs1l7bEo",
    authDomain: "multiplayerchess-f14e2.firebaseapp.com",
    databaseURL: "https://multiplayerchess-f14e2-default-rtdb.firebaseio.com",
    projectId: "multiplayerchess-f14e2",
    storageBucket: "multiplayerchess-f14e2.firebasestorage.app",
    messagingSenderId: "342939809096",
    appId: "1:342939809096:web:e3851853c4ffc6d684ef7d"
};
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();

var board = null;
var game = new Chess();
var $status = $('#status');
var currentMode = 'local';
var userColor = 'white';
var selectedSquare = null; // Ise har naye game mein empty karna zaroori hai
var gameRef = null; 
var roomId = null;

// --- NAVIGATION ---
history.replaceState({page: 'menu'}, "Menu", "");
window.onpopstate = function(event) {
    var state = event.state ? event.state.page : 'menu';
    if (state === 'menu') goBackToMenu();
    else if (state === 'color') { hideAllScreens(); document.getElementById('color-select').style.display = 'flex'; }
    else if (state === 'multiplayer') { hideAllScreens(); document.getElementById('multiplayer-menu').style.display = 'flex'; }
};

function startFlow(mode) {
    currentMode = mode;
    hideAllScreens();
    if (mode === 'local') {
        userColor = 'white'; 
        showGameScreen();
        history.pushState({page: 'game'}, "Game", ""); 
    } else if (mode === 'computer') {
        document.getElementById('color-select').style.display = 'flex';
        history.pushState({page: 'color'}, "Color", ""); 
    } else if (mode === 'multiplayer') {
        document.getElementById('multiplayer-menu').style.display = 'flex';
        history.pushState({page: 'multiplayer'}, "Lobby", "");
    }
}

function selectColor(color) {
    userColor = color;
    hideAllScreens();
    showGameScreen();
    history.pushState({page: 'game'}, "Game", ""); 
}

function goBack() { history.back(); }

function goBackToMenu() {
    if (gameRef) { gameRef.off(); gameRef = null; } 
    game.reset();
    clearHighlights();
    selectedSquare = null; // BUG FIX: Purani guti dimaag se nikal do
    document.getElementById('room-status').innerText = "";
    document.getElementById('room-id-input').value = "";
    hideAllScreens();
    document.getElementById('main-menu').style.display = 'flex';
}

function hideAllScreens() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('color-select').style.display = 'none';
    document.getElementById('multiplayer-menu').style.display = 'none';
    document.getElementById('game-screen').style.display = 'none';
}

// --- MULTIPLAYER ROOM LOGIC ---
function createRoom() {
    var selectedColor = document.getElementById('host-color').value;
    userColor = selectedColor; 

    roomId = Math.floor(1000 + Math.random() * 9000).toString();
    document.getElementById('room-status').innerText = "Room Code: " + roomId + "\nWaiting for friend...";
    
    gameRef = database.ref('games/' + roomId);
    gameRef.set({ 
        fen: game.fen(), 
        hostColor: userColor 
    });

    gameRef.on('value', function(snapshot) {
        var data = snapshot.val();
        if (data && data.joined) {
            document.getElementById('room-status').innerText = "Friend Joined! Starting...";
            setTimeout(function() { showGameScreen(); history.pushState({page: 'game'}, "Game", ""); }, 1000);
        }
    });
}

function joinRoom() {
    var inputCode = document.getElementById('room-id-input').value;
    if (inputCode.length !== 4) { alert("Enter a valid 4-digit code!"); return; }
    
    document.getElementById('room-status').innerText = "Joining...";
    var checkRef = database.ref('games/' + inputCode);
    
    checkRef.once('value').then(function(snapshot) {
        if (snapshot.exists()) {
            var data = snapshot.val();
            roomId = inputCode;
            
            if (data.hostColor === 'white') {
                userColor = 'black';
            } else {
                userColor = 'white';
            }
            
            gameRef = checkRef;
            gameRef.update({ joined: true }); 
            showGameScreen();
            history.pushState({page: 'game'}, "Game", "");
        } else {
            document.getElementById('room-status').innerText = "Room not found!";
        }
    });
}

function setupFirebaseListener() {
    if (!gameRef) return;
    gameRef.on('value', function(snapshot) {
        var data = snapshot.val();
        if (data && data.fen !== game.fen()) {
            game.load(data.fen);
            board.position(data.fen);
            updateStatus();
        }
    });
}

// --- GAME RENDER LOGIC ---
function showGameScreen() {
    document.getElementById('multiplayer-menu').style.display = 'none';
    document.getElementById('game-screen').style.display = 'block';
    
    document.getElementById('room-display').innerText = "";
    if(currentMode === 'local') document.getElementById('mode-title').innerText = "Pass & Play";
    else if (currentMode === 'computer') document.getElementById('mode-title').innerText = "Vs Computer";
    else if (currentMode === 'multiplayer') {
        document.getElementById('mode-title').innerText = "Online Match";
        document.getElementById('room-display').innerText = "Room: " + roomId + " | You are: " + userColor.toUpperCase();
        setupFirebaseListener(); 
    }

    game.reset();
    selectedSquare = null; // BUG FIX: Naye match me selection reset karo

    var config = {
      draggable: true,
      position: 'start',
      orientation: userColor,
      onDragStart: onDragStart,
      onDrop: onDrop,
      onSnapEnd: onSnapEnd,
      pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
    };

    if(board !== null) board.destroy();
    board = Chessboard('myBoard', config);
    updateStatus();

    if (currentMode === 'computer' && userColor === 'black') {
        window.setTimeout(makeComputerMove, 600);
    }
}

// --- CHESS MOVEMENT LOGIC ---
function clearHighlights() {
    $('#myBoard .square-55d63').removeClass('highlight-selected hint-dot hint-capture');
}

var lastTap = 0;

// BUG FIX: $(document).on use kiya hai taaki board refresh hone par touch events disconnect na hon
$(document).off('touchstart mousedown', '#myBoard .square-55d63, #myBoard .piece-417db');
$(document).on('touchstart mousedown', '#myBoard .square-55d63, #myBoard .piece-417db', function(e) {
    var now = new Date().getTime();
    if (now - lastTap < 100) return;
    lastTap = now;

    if (game.game_over()) return;

    var clickedSquare = $(this).closest('.square-55d63').attr('data-square');
    var piece = game.get(clickedSquare);

    if ((currentMode === 'computer' || currentMode === 'multiplayer') && game.turn() !== userColor.charAt(0)) return; 

    if (selectedSquare) {
        var move = game.move({ from: selectedSquare, to: clickedSquare, promotion: 'q' });

        if (move) {
            board.position(game.fen());
            clearHighlights();
            selectedSquare = null;
            updateStatus();
            afterMoveActions();
            return; 
        } 
    }

    clearHighlights();
    
    if (piece && piece.color === game.turn()) {
        if ((currentMode === 'computer' || currentMode === 'multiplayer') && piece.color !== userColor.charAt(0)) {
            selectedSquare = null; return;
        }

        selectedSquare = clickedSquare;
        $('#myBoard .square-' + clickedSquare).addClass('highlight-selected');

        var moves = game.moves({ square: clickedSquare, verbose: true });
        moves.forEach(function(m) {
            var $targetSquare = $('#myBoard .square-' + m.to);
            if (game.get(m.to)) $targetSquare.addClass('hint-capture'); 
            else $targetSquare.addClass('hint-dot'); 
        });
    } else {
        selectedSquare = null;
    }
});

function onDragStart(source, piece) {
    if (game.game_over()) return false;
    if ((currentMode === 'computer' || currentMode === 'multiplayer') && piece.charAt(0) !== userColor.charAt(0)) return false;
    if ((game.turn() === 'w' && piece.search(/^b/) !== -1) || (game.turn() === 'b' && piece.search(/^w/) !== -1)) return false;
}

function onDrop(source, target) {
    if(source === target) return; 
    var move = game.move({ from: source, to: target, promotion: 'q' });
    if (move === null) return 'snapback';
    
    selectedSquare = null;
    clearHighlights();
    updateStatus();
    afterMoveActions();
}

function onSnapEnd() { board.position(game.fen()); }

function afterMoveActions() {
    if (currentMode === 'multiplayer' && gameRef) {
        gameRef.update({ fen: game.fen() });
    }
    else if (currentMode === 'computer' && !game.game_over()) {
        window.setTimeout(makeComputerMove, 400);
    }
}

function makeComputerMove() {
    var possibleMoves = game.moves();
    if (possibleMoves.length === 0) return; 
    var randomIdx = Math.floor(Math.random() * possibleMoves.length);
    game.move(possibleMoves[randomIdx]);
    board.position(game.fen());
    clearHighlights();
    selectedSquare = null;
    updateStatus();
}

function updateStatus () {
    var statusHTML = '';
    var turnMsg = (game.turn() === 'b') ? 'Black' : 'White';
    if (game.in_checkmate()) statusHTML = 'Game over, ' + turnMsg + ' is in checkmate.';
    else if (game.in_draw()) statusHTML = 'Game over, drawn position';
    else {
        statusHTML = turnMsg + ' to move';
        if (game.in_check()) statusHTML += ', ' + turnMsg + ' is in check';
    }
    $status.html(statusHTML);
}

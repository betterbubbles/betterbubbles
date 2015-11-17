/* 
   BubblesBit v1.1.2
  - New Layout to fit mobile screen
   BubblesBit v1.1.1
  - Implementing new bet buttons
  - Add popping effects
   BubblesBit v1.0.4
  - Testing new canvas animations
   BubblesBit v1.0.3
  - Add bubble buttons for betting
   BubblesBit v1.0.2
  - New Layout Design
*/

var config = {
  // - Your app's id on moneypot.com
  app_id: 755,
  // - Displayed in the navbar
  app_name: 'Better Bubbles',
  // - For your faucet to work, you must register your site at Recaptcha
  // - https://www.google.com/recaptcha/intro/index.html
  recaptcha_sitekey: '6Ld7LBETAAAAAFODkNxwWekmj9x_Z1y3GoC7v7ZN',
  redirect_uri: 'https://betterbubbles.github.io',
  mp_browser_uri: 'https://www.moneypot.com',
  mp_api_uri: 'https://api.moneypot.com',
  chat_uri: '//socket.moneypot.com',
  // - Show debug output only if running on localhost
  debug: isRunningLocally(),
  // - Set this to true if you want users that come to http:// to be redirected
  //   to https://
  force_https_redirect: !isRunningLocally(),
  // - Configure the house edge (default is 1%)
  //   Must be between 0.0 (0%) and 1.0 (100%)
  house_edge: 0.01,
  chat_buffer_size: 250,
  // - The amount of bets to show on screen in each tab
  bet_buffer_size: 15
};

////////////////////////////////////////////////////////////
// You shouldn't have to edit anything below this line
////////////////////////////////////////////////////////////

// Validate the configured house edge
(function() {
  var errString;

  if (config.house_edge <= 0.0) {
    errString = 'House edge must be > 0.0 (0%)';
  } else if (config.house_edge >= 100.0) {
    errString = 'House edge must be < 1.0 (100%)';
  }

  if (errString) {
    alert(errString);
    throw new Error(errString);
  }

  // Sanity check: Print house edge
  console.log('House Edge:', (config.house_edge * 100).toString() + '%');
})();

////////////////////////////////////////////////////////////

if (config.force_https_redirect && window.location.protocol !== "https:") {
  window.location.href = "https:" + window.location.href.substring(window.location.protocol.length);
}

// Hoist it. It's impl'd at bottom of page.
var socket;

// :: Bool
function isRunningLocally() {
  return /^localhost/.test(window.location.host);
}

var el = React.DOM;

// Generates UUID for uniquely tagging components
var genUuid = function() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
};

var helpers = {};

// For displaying HH:MM timestamp in chat
//
// String (Date JSON) -> String
helpers.formatDateToTime = function(dateJson) {
  var date = new Date(dateJson);
  return _.padLeft(date.getHours().toString(), 2, '0') +
    ':' +
    _.padLeft(date.getMinutes().toString(), 2, '0');
};

// Number -> Number in range (0, 1)
helpers.multiplierToWinProb = function(multiplier) {
  console.assert(typeof multiplier === 'number');
  console.assert(multiplier > 0);

  // For example, n is 0.99 when house edge is 1%
  var n = 1.0 - config.house_edge;

  return n / multiplier;
};

helpers.calcNumber = function(cond, winProb) {
  console.assert(cond === '<' || cond === '>');
  console.assert(typeof winProb === 'number');

  if (cond === '<') {
    return winProb * 100;
  } else {
    return 99.99 - (winProb * 100);
  }
};

helpers.roleToLabelElement = function(role) {
  switch(role) {
    case 'ADMIN':
      return el.span({className: 'label label-danger'}, 'MP Staff');
    case 'MOD':
      return el.span({className: 'label label-info'}, 'Mod');
    case 'OWNER':
      return el.span({className: 'label label-primary'}, 'Owner');
    default:
      return '';
  }
};

// -> Object
helpers.getHashParams = function() {
  var hashParams = {};
  var e,
      a = /\+/g,  // Regex for replacing addition symbol with a space
      r = /([^&;=]+)=?([^&;]*)/g,
      d = function (s) { return decodeURIComponent(s.replace(a, " ")); },
      q = window.location.hash.substring(1);
  while (e = r.exec(q))
    hashParams[d(e[1])] = d(e[2]);
  return hashParams;
};

// getPrecision('1') -> 0
// getPrecision('.05') -> 2
// getPrecision('25e-100') -> 100
// getPrecision('2.5e-99') -> 100
helpers.getPrecision = function(num) {
  var match = (''+num).match(/(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
  if (!match) { return 0; }
  return Math.max(
    0,
    // Number of digits right of decimal point.
    (match[1] ? match[1].length : 0) -
    // Adjust for scientific notation.
    (match[2] ? +match[2] : 0));
};

/**
 * Decimal adjustment of a number.
 *
 * @param {String}  type  The type of adjustment.
 * @param {Number}  value The number.
 * @param {Integer} exp   The exponent (the 10 logarithm of the adjustment base).
 * @returns {Number} The adjusted value.
 */
helpers.decimalAdjust = function(type, value, exp) {
  // If the exp is undefined or zero...
  if (typeof exp === 'undefined' || +exp === 0) {
    return Math[type](value);
  }
  value = +value;
  exp = +exp;
  // If the value is not a number or the exp is not an integer...
  if (isNaN(value) || !(typeof exp === 'number' && exp % 1 === 0)) {
    return NaN;
  }
  // Shift
  value = value.toString().split('e');
  value = Math[type](+(value[0] + 'e' + (value[1] ? (+value[1] - exp) : -exp)));
  // Shift back
  value = value.toString().split('e');
  return +(value[0] + 'e' + (value[1] ? (+value[1] + exp) : exp));
}

helpers.round10 = function(value, exp) {
  return helpers.decimalAdjust('round', value, exp);
};

helpers.floor10 = function(value, exp) {
  return helpers.decimalAdjust('floor', value, exp);
};

helpers.ceil10 = function(value, exp) {
  return helpers.decimalAdjust('ceil', value, exp);
};

////////////////////////////////////////////////////////////

// A weak Moneypot API abstraction
//
// Moneypot's API docs: https://www.moneypot.com/api-docs
var MoneyPot = (function() {

  var o = {};

  o.apiVersion = 'v1';

  // method: 'GET' | 'POST' | ...
  // endpoint: '/tokens/abcd-efgh-...'
  var noop = function() {};
  var makeMPRequest = function(method, bodyParams, endpoint, callbacks, overrideOpts) {

    if (!worldStore.state.accessToken)
      throw new Error('Must have accessToken set to call MoneyPot API');

    var url = config.mp_api_uri + '/' + o.apiVersion + endpoint;

    if (worldStore.state.accessToken) {
      url = url + '?access_token=' + worldStore.state.accessToken;
    }

    var ajaxOpts = {
      url:      url,
      dataType: 'json', // data type of response
      method:   method,
      data:     bodyParams ? JSON.stringify(bodyParams) : undefined,
      // By using text/plain, even though this is a JSON request,
      // we avoid preflight request. (Moneypot explicitly supports this)
      headers: {
        'Content-Type': 'text/plain'
      },
      // Callbacks
      success:  callbacks.success || noop,
      error:    callbacks.error || noop,
      complete: callbacks.complete || noop
    };

    $.ajax(_.merge({}, ajaxOpts, overrideOpts || {}));
  };

  o.listBets = function(callbacks) {
    var endpoint = '/list-bets';
    makeMPRequest('GET', undefined, endpoint, callbacks, {
      data: {
        app_id: config.app_id,
        limit: config.bet_buffer_size
      }
    });
  };

  o.getTokenInfo = function(callbacks) {
    var endpoint = '/token';
    makeMPRequest('GET', undefined, endpoint, callbacks);
  };

  o.generateBetHash = function(callbacks) {
    var endpoint = '/hashes';
    makeMPRequest('POST', undefined, endpoint, callbacks);
  };

  o.getDepositAddress = function(callbacks) {
    var endpoint = '/deposit-address';
    makeMPRequest('GET', undefined, endpoint, callbacks);
  };

  // gRecaptchaResponse is string response from google server
  // `callbacks.success` signature	is fn({ claim_id: Int, amoutn: Satoshis })
  o.claimFaucet = function(gRecaptchaResponse, callbacks) {
    console.log('Hitting POST /claim-faucet');
    var endpoint = '/claim-faucet';
    var body = { response: gRecaptchaResponse };
    makeMPRequest('POST', body, endpoint, callbacks);
  };

  // bodyParams is an object:
  // - wager: Int in satoshis
  // - client_seed: Int in range [0, 0^32)
  // - hash: BetHash
  // - cond: '<' | '>'
  // - number: Int in range [0, 99.99] that cond applies to
  // - payout: how many satoshis to pay out total on win (wager * multiplier)
  o.placeSimpleDiceBet = function(bodyParams, callbacks) {
    var endpoint = '/bets/simple-dice';
    makeMPRequest('POST', bodyParams, endpoint, callbacks);
  };

  return o;
})();

////////////////////////////////////////////////////////////

var Dispatcher = new (function() {
  // Map of actionName -> [Callback]
  this.callbacks = {};

  var self = this;

  // Hook up a store's callback to receive dispatched actions from dispatcher
  //
  // Ex: Dispatcher.registerCallback('NEW_MESSAGE', function(message) {
  //       console.log('store received new message');
  //       self.state.messages.push(message);
  //       self.emitter.emit('change', self.state);
  //     });
  this.registerCallback = function(actionName, cb) {
    console.log('[Dispatcher] registering callback for:', actionName);

    if (!self.callbacks[actionName]) {
      self.callbacks[actionName] = [cb];
    } else {
      self.callbacks[actionName].push(cb);
    }
  };

  this.sendAction = function(actionName, payload) {
    console.log('[Dispatcher] received action:', actionName, payload);

    // Ensure this action has 1+ registered callbacks
    if (!self.callbacks[actionName]) {
      throw new Error('Unsupported actionName: ' + actionName);
    }

    // Dispatch payload to each registered callback for this action
    self.callbacks[actionName].forEach(function(cb) {
      cb(payload);
    });
  };
});

////////////////////////////////////////////////////////////

var Store = function(storeName, initState, initCallback) {

  this.state = initState;
  this.emitter = new EventEmitter();

  // Execute callback immediately once store (above state) is setup
  // This callback should be used by the store to register its callbacks
  // to the dispatcher upon initialization
  initCallback.call(this);

  var self = this;

  // Allow components to listen to store events (i.e. its 'change' event)
  this.on = function(eventName, cb) {
    self.emitter.on(eventName, cb);
  };

  this.off = function(eventName, cb) {
    self.emitter.off(eventName, cb);
  };
};

////////////////////////////////////////////////////////////

// Manage access_token //////////////////////////////////////
//
// - If access_token is in url, save it into localStorage.
//   `expires_in` (seconds until expiration) will also exist in url
//   so turn it into a date that we can compare

var access_token, expires_in, expires_at;

if (helpers.getHashParams().access_token) {
  console.log('[token manager] access_token in hash params');
  access_token = helpers.getHashParams().access_token;
  expires_in = helpers.getHashParams().expires_in;
  expires_at = new Date(Date.now() + (expires_in * 1000));

  localStorage.setItem('access_token', access_token);
  localStorage.setItem('expires_at', expires_at);
} else if (localStorage.access_token) {
  console.log('[token manager] access_token in localStorage');
  expires_at = localStorage.expires_at;
  // Only get access_token from localStorage if it expires
  // in a week or more. access_tokens are valid for two weeks
  if (expires_at && new Date(expires_at) > new Date(Date.now() + (1000 * 60 * 60 * 24 * 7))) {
    access_token = localStorage.access_token;
  } else {
    localStorage.removeItem('expires_at');
    localStorage.removeItem('access_token');
  }
} else {
  console.log('[token manager] no access token');
}

// Scrub fragment params from url.
if (window.history && window.history.replaceState) {
  window.history.replaceState({}, document.title, "/");
} else {
  // For browsers that don't support html5 history api, just do it the old
  // fashioned way that leaves a trailing '#' in the url
  window.location.hash = '#';
}

////////////////////////////////////////////////////////////

var chatStore = new Store('chat', {
  messages: new CBuffer(config.chat_buffer_size),
  waitingForServer: false,
  userList: {},
  showUserList: false,
  loadingInitialMessages: true
}, function() {
  var self = this;

  // `data` is object received from socket auth
  Dispatcher.registerCallback('INIT_CHAT', function(data) {
    console.log('[ChatStore] received INIT_CHAT');
    // Give each one unique id
    var messages = data.chat.messages.map(function(message) {
      message.id = genUuid();
      return message;
    });

    // Reset the CBuffer since this event may fire multiple times,
    // e.g. upon every reconnection to chat-server.
    self.state.messages.empty();

    self.state.messages.push.apply(self.state.messages, messages);

    // Indicate that we're done with initial fetch
    self.state.loadingInitialMessages = false;

    // Load userList
    self.state.userList = data.chat.userlist;
    self.emitter.emit('change', self.state);
    self.emitter.emit('init');
  });

  Dispatcher.registerCallback('NEW_MESSAGE', function(message) {
    console.log('[ChatStore] received NEW_MESSAGE');
    message.id = genUuid();
    self.state.messages.push(message);

    self.emitter.emit('change', self.state);
    self.emitter.emit('new_message');
  });

  Dispatcher.registerCallback('TOGGLE_CHAT_USERLIST', function() {
    console.log('[ChatStore] received TOGGLE_CHAT_USERLIST');
    self.state.showUserList = !self.state.showUserList;
    self.emitter.emit('change', self.state);
  });

  // user is { id: Int, uname: String, role: 'admin' | 'mod' | 'owner' | 'member' }
  Dispatcher.registerCallback('USER_JOINED', function(user) {
    console.log('[ChatStore] received USER_JOINED:', user);
    self.state.userList[user.uname] = user;
    self.emitter.emit('change', self.state);
  });

  // user is { id: Int, uname: String, role: 'admin' | 'mod' | 'owner' | 'member' }
  Dispatcher.registerCallback('USER_LEFT', function(user) {
    console.log('[ChatStore] received USER_LEFT:', user);
    delete self.state.userList[user.uname];
    self.emitter.emit('change', self.state);
  });

  // Message is { text: String }
  Dispatcher.registerCallback('SEND_MESSAGE', function(text) {
    console.log('[ChatStore] received SEND_MESSAGE');
    self.state.waitingForServer = true;
    self.emitter.emit('change', self.state);
    socket.emit('new_message', { text: text }, function(err) {
      if (err) {
        alert('Chat Error: ' + err);
      }
    });
  });
});

var betStore = new Store('bet', {
  nextHash: undefined,
  wager: {
    str: '1',
    num: 1,
    error: undefined
  },
  multiplier: {
    str: '2.00',
    num: 2.00,
    error: undefined
  },
  betnumbers: {
    str: '0',
    num: 0,
    error: undefined
  },
  increaselose: {
    str: '100',
    num: 100,
    error: undefined
  },
  basebet: {
    str: '',
    num: 1,
    error: undefined
  },
  hotkeysEnabled: false,
  oldstyleEnabled: false,
  autobettingEnabled: false,
  soundEnabled: true
}, function() {
  var self = this;

  Dispatcher.registerCallback('SET_NEXT_HASH', function(hexString) {
    self.state.nextHash = hexString;
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('UPDATE_WAGER', function(newWager) {
    self.state.wager = _.merge({}, self.state.wager, newWager);

    var n = parseInt(self.state.wager.str, 10);

    // If n is a number, ensure it's at least 1 bit
    if (isFinite(n)) {
      n = Math.max(n, 1);
      self.state.wager.str = n.toString();
    }

    // Ensure wagerString is a number
    if (isNaN(n) || /[^\d]/.test(n.toString())) {
      self.state.wager.error = 'INVALID_WAGER';
    // Ensure user can afford balance
    } else if (n * 100 > worldStore.state.user.balance) {
      self.state.wager.error = 'CANNOT_AFFORD_WAGER';
      self.state.wager.num = n;
    } else {
      // wagerString is valid
      self.state.wager.error = null;
      self.state.wager.str = n.toString();
      self.state.wager.num = n;
    }

    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('UPDATE_BETNUMBERS', function(newBetNums) {
    self.state.betnumbers = _.merge({}, self.state.betnumbers, newBetNums);
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('UPDATE_INCREASELOSE', function(newIncLose) {
    self.state.increaselose = _.merge({}, self.state.increaselose, newIncLose);
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('UPDATE_MULTIPLIER', function(newMult) {
    self.state.multiplier = _.merge({}, self.state.multiplier, newMult);
    self.emitter.emit('change', self.state);
  });
});

// The general store that holds all things until they are separated
// into smaller stores for performance.
var worldStore = new Store('world', {
  isLoading: true,
  user: undefined,
  accessToken: access_token,
  isRefreshingUser: false,
  hotkeysEnabled: false,
  oldstyleEnabled: false,
  autobettingEnabled: false,
  soundEnabled: true,
  currTab: 'ALL_BETS',
  // TODO: Turn this into myBets or something
  bets: new CBuffer(config.bet_buffer_size),
  // TODO: Fetch list on load alongside socket subscription
  allBets: new CBuffer(config.bet_buffer_size),
  grecaptcha: undefined
}, function() {
  var self = this;

  // TODO: Consider making these emit events unique to each callback
  // for more granular reaction.

  // data is object, note, assumes user is already an object
  Dispatcher.registerCallback('UPDATE_USER', function(data) {
    self.state.user = _.merge({}, self.state.user, data);
    self.emitter.emit('change', self.state);
  });

  // deprecate in favor of SET_USER
  Dispatcher.registerCallback('USER_LOGIN', function(user) {
    self.state.user = user;
    self.emitter.emit('change', self.state);
    self.emitter.emit('user_update');
  });

  // Replace with CLEAR_USER
  Dispatcher.registerCallback('USER_LOGOUT', function() {
    self.state.user = undefined;
    self.state.accessToken = undefined;
    localStorage.removeItem('expires_at');
    localStorage.removeItem('access_token');
    self.state.bets.empty();
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('START_LOADING', function() {
    self.state.isLoading = true;
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('STOP_LOADING', function() {
    self.state.isLoading = false;
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('CHANGE_TAB', function(tabName) {
    console.assert(typeof tabName === 'string');
    self.state.currTab = tabName;
    self.emitter.emit('change', self.state);
  });

  // This is only for my bets? Then change to 'NEW_MY_BET'
  Dispatcher.registerCallback('NEW_BET', function(bet) {
    console.assert(typeof bet === 'object');
    self.state.bets.push(bet);
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('NEW_ALL_BET', function(bet) {
    self.state.allBets.push(bet);
    self.emitter.emit('change', self.state);
    if (worldStore.state.currTab === 'ALL_BETS') {
    if (bet.cond === '<') {
       if (bet.target <= 99.99 && bet.target >=33.01) {
           c = 'rgba(51, 153, 0, 0.4)';
       }
           img = document.getElementById("greenbubble");
       if (bet.target <= 33.00 && bet.target >=9.91) {
           c = 'rgba(255, 205, 0, 0.4)';
           img = document.getElementById("yellowbubble");
       }
       if (bet.target <= 9.90 && bet.target >=0.01) {
           c = 'rgba(204, 0, 0, 0.4)';
           img = document.getElementById("redbubble");
       }
    };
    if (bet.cond === '>') {
       if (bet.target >= 0.01 && bet.target <=66.98) {
           c = 'rgba(51, 153, 0, 0.4)';
       }
           img = document.getElementById("greenbubble");
       if (bet.target >= 66.99 && bet.target <=90.08) {
           c = 'rgba(255, 205, 0, 0.4)';
           img = document.getElementById("yellowbubble");
       }
       if (bet.target >= 90.09 && bet.target <=99.99) {
           c = 'rgba(204, 0, 0, 0.4)';
           img = document.getElementById("redbubble");
       }
    };
    Bubbles.push(new Bubble(img,c,bet.outcome,bet.profit,bet.uname.substr(0,4)));
    BubbleStart();
      };
  });

  Dispatcher.registerCallback('INIT_ALL_BETS', function(bets) {
    console.assert(_.isArray(bets));
    self.state.allBets.push.apply(self.state.allBets, bets);
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('TOGGLE_HOTKEYS', function() {
    self.state.hotkeysEnabled = !self.state.hotkeysEnabled;
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('DISABLE_HOTKEYS', function() {
    self.state.hotkeysEnabled = false;
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('TOGGLE_OLDSTYLE', function() {
    self.state.oldstyleEnabled = !self.state.oldstyleEnabled;
    self.emitter.emit('change', self.state);
    var num = document.getElementById("input-multi").value;
    Dispatcher.sendAction('UPDATE_MULTIPLIER', { num: Number(num), error: null });
  });

  Dispatcher.registerCallback('TOGGLE_AUTOBETTING', function() {
    self.state.autobettingEnabled = !self.state.autobettingEnabled;
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('TOGGLE_SOUND', function() {
    self.state.soundEnabled = !self.state.soundEnabled;
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('START_REFRESHING_USER', function() {
    self.state.isRefreshingUser = true;
    self.emitter.emit('change', self.state);
    MoneyPot.getTokenInfo({
      success: function(data) {
        console.log('Successfully loaded user from tokens endpoint', data);
        var user = data.auth.user;
        self.state.user = user;
        self.emitter.emit('change', self.state);
        self.emitter.emit('user_update');
      },
      error: function(err) {
        console.log('Error:', err);
      },
      complete: function() {
        Dispatcher.sendAction('STOP_REFRESHING_USER');
      }
    });
  });

  Dispatcher.registerCallback('STOP_REFRESHING_USER', function() {
    self.state.isRefreshingUser = false;
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('GRECAPTCHA_LOADED', function(_grecaptcha) {
    self.state.grecaptcha = _grecaptcha;
    self.emitter.emit('grecaptcha_loaded');
  });

});

////////////////////////////////////////////////////////////


////////////////////////////////////////////////////////////

var UserBox = React.createClass({
  displayName: 'UserBox',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    worldStore.on('change', this._onStoreChange);
    betStore.on('change', this._onStoreChange);
  },
  componentWillUnount: function() {
    worldStore.off('change', this._onStoreChange);
    betStore.off('change', this._onStoreChange);
  },
  _onLogout: function() {
    Dispatcher.sendAction('USER_LOGOUT');
  },
  _onRefreshUser: function() {
    Dispatcher.sendAction('START_REFRESHING_USER');
  },
  _openWithdrawPopup: function() {
    var windowUrl = config.mp_browser_uri + '/dialog/withdraw?app_id=' + config.app_id;
    var windowName = 'manage-auth';
    var windowOpts = [
      'width=420',
      'height=350',
      'left=100',
      'top=100'
    ].join(',');
    var windowRef = window.open(windowUrl, windowName, windowOpts);
    windowRef.focus();
    return false;
  },
  _openDepositPopup: function() {
    var windowUrl = config.mp_browser_uri + '/dialog/deposit?app_id=' + config.app_id;
    var windowName = 'manage-auth';
    var windowOpts = [
      'width=420',
      'height=350',
      'left=100',
      'top=100'
    ].join(',');
    var windowRef = window.open(windowUrl, windowName, windowOpts);
    windowRef.focus();
    return false;
  },
  render: function() {

    var innerNode;
    if (worldStore.state.isLoading) {
      innerNode = el.p(
        {className: 'navbar-text'},
        'Loading...'
      );
    } else if (worldStore.state.user) {
      innerNode = el.div(
        null,
        el.div(
            {className: 'col-xs-2', style: {width: '120px'}},
            React.createElement(SoundToggle, null)
        ),
        // Deposit/Withdraw popup buttons
        el.div(
          {className: 'btn-group navbar-left btn-group-xs'},
          el.button(
            {
              type: 'button',
              className: 'btn navbar-btn btn-xs ' + (betStore.state.wager.error === 'CANNOT_AFFORD_WAGER' ? 'btn-success' : 'btn-default'),
              onClick: this._openDepositPopup
            },
            'Deposit'
          ),
          el.button(
            {
              type: 'button',
              className: 'btn btn-default navbar-btn btn-xs',
              onClick: this._openWithdrawPopup
            },
            'Withdraw'
          )
        ),
        // Balance
        el.span(
          {
            className: 'navbar-text',
            style: {marginRight: '5px'}
          },
          (worldStore.state.user.balance / 100).toFixed(2) + ' bits',
          !worldStore.state.user.unconfirmed_balance ?
           '' :
           el.span(
             {style: { color: '#e67e22'}},
             ' + ' + (worldStore.state.user.unconfirmed_balance / 100) + ' bits pending'
           )
        ),
        // Refresh button
        el.button(
          {
            className: 'btn btn-link navbar-btn navbar-left ' + (worldStore.state.isRefreshingUser ? ' rotate' : ''),
            title: 'Refresh Balance',
            disabled: worldStore.state.isRefreshingUser,
            onClick: this._onRefreshUser,
            style: {
              paddingLeft: 0,
              paddingRight: 0,
              marginRight: '10px'
            }
          },
          el.span({className: 'glyphicon glyphicon-refresh'})
        ),
        // Logged in as...
        el.span(
          {className: 'navbar-text'},
          'Logged in as ',
          el.code(null, worldStore.state.user.uname)
        ),
        // Logout button
        el.button(
          {
            type: 'button',
            onClick: this._onLogout,
            className: 'navbar-btn btn btn-default'
          },
          'Logout'
        )
      );
    } else {
      // User needs to login
      innerNode = el.p(
        {className: 'navbar-text'},
        el.a(
          {
            href: config.mp_browser_uri + '/oauth/authorize' +
              '?app_id=' + config.app_id +
              '&redirect_uri=' + config.redirect_uri,
            className: 'btn btn-default'
          },
          'Login with Moneypot'
        )
      );
    }

    return el.div(
      {className: 'navbar-right'},
      innerNode
    );
  }
});

var Navbar = React.createClass({
  displayName: 'Navbar',
  render: function() {
    return el.div(
      {className: 'navbar'},
      el.div(
        {className: 'container-fluid'},
/*        el.div(
          {className: 'navbar-header'},
          el.a({className: 'navbar-brand', href:'/'}, config.app_name)
        ),
        // Links
        el.ul(
          {className: 'nav navbar-nav'},
          el.li(
            null,
            el.a(
              {
                href: config.mp_browser_uri + '/apps/' + config.app_id,
                target: '_blank'
              },
              'View on Moneypot ',
              // External site glyphicon
              el.span(
                {className: 'glyphicon glyphicon-new-window'}
              )
            )
          )
        ),*/
        // Userbox
        React.createElement(UserBox, null)
      )
    );
  }
});

var ChatBoxInput = React.createClass({
  displayName: 'ChatBoxInput',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    chatStore.on('change', this._onStoreChange);
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    chatStore.off('change', this._onStoreChange);
    worldStore.off('change', this._onStoreChange);
  },
  //
  getInitialState: function() {
    return { text: '' };
  },
  // Whenever input changes
  _onChange: function(e) {
    this.setState({ text: e.target.value });
  },
  // When input contents are submitted to chat server
  _onSend: function() {
    var self = this;
    Dispatcher.sendAction('SEND_MESSAGE', this.state.text);
    this.setState({ text: '' });
  },
  _onFocus: function() {
    // When users click the chat input, turn off bet hotkeys so they
    // don't accidentally bet
    if (worldStore.state.hotkeysEnabled) {
      Dispatcher.sendAction('DISABLE_HOTKEYS');
    }
  },
  _onKeyPress: function(e) {
    var ENTER = 13;
    if (e.which === ENTER) {
      if (this.state.text.trim().length > 0) {
        this._onSend();
      }
    }
  },
  render: function() {
    return (
      el.div(
        {className: 'row'},
        el.div(
          {className: 'col-md-9'},
          chatStore.state.loadingInitialMessages ?
            el.div(
              {
                style: {marginTop: '7px'},
                className: 'text-muted'
              },
              el.span(
                {className: 'glyphicon glyphicon-refresh rotate'}
              ),
              ' Loading...'
            )
          :
            el.input(
              {
                id: 'chat-input',
                className: 'form-control',
                type: 'text',
                value: this.state.text,
                placeholder: worldStore.state.user ?
                  'Click here and begin typing...' :
                  'Login to chat',
                onChange: this._onChange,
                onKeyPress: this._onKeyPress,
                onFocus: this._onFocus,
                ref: 'input',
                // TODO: disable while fetching messages
                disabled: !worldStore.state.user || chatStore.state.loadingInitialMessages
              }
            )
        ),
        el.div(
          {className: 'col-md-3'},
          el.button(
            {
              type: 'button',
              className: 'btn btn-default btn-block',
              disabled: !worldStore.state.user ||
                chatStore.state.waitingForServer ||
                this.state.text.trim().length === 0,
              onClick: this._onSend
            },
            'Send'
          )
        )
      )
    );
  }
});

var ChatUserList = React.createClass({
  displayName: 'ChatUserList',
  render: function() {
    return (
      el.div(
        {className: 'panel panel-default'},
        el.div(
          {className: 'panel-heading'},
          'UserList'
        ),
        el.div(
          {className: 'panel-body'},
          el.ul(
            {},
            _.values(chatStore.state.userList).map(function(u) {
              return el.li(
                {
                  key: u.uname
                },
                helpers.roleToLabelElement(u.role),
                ' ' + u.uname
              );
            })
          )
        )
      )
    );
  }
});

var ChatBox = React.createClass({
  displayName: 'ChatBox',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  // New messages should only force scroll if user is scrolled near the bottom
  // already. This allows users to scroll back to earlier convo without being
  // forced to scroll to bottom when new messages arrive
  _onNewMessage: function() {
    var node = this.refs.chatListRef.getDOMNode();

    // Only scroll if user is within 100 pixels of last message
    var shouldScroll = function() {
      var distanceFromBottom = node.scrollHeight - ($(node).scrollTop() + $(node).innerHeight());
      console.log('DistanceFromBottom:', distanceFromBottom);
      return distanceFromBottom <= 100;
    };

    if (shouldScroll()) {
      this._scrollChat();
    }
  },
  _scrollChat: function() {
    var node = this.refs.chatListRef.getDOMNode();
    $(node).scrollTop(node.scrollHeight);
  },
  componentDidMount: function() {
    chatStore.on('change', this._onStoreChange);
    chatStore.on('new_message', this._onNewMessage);
    chatStore.on('init', this._scrollChat);
  },
  componentWillUnmount: function() {
    chatStore.off('change', this._onStoreChange);
    chatStore.off('new_message', this._onNewMessage);
    chatStore.off('init', this._scrollChat);
  },
  //
  _onUserListToggle: function() {
    Dispatcher.sendAction('TOGGLE_CHAT_USERLIST');
  },
  render: function() {
    return el.div(
      {id: 'chat-box'},
      el.div(
        {className: 'panel panel-default'},
        el.div(
          {className: 'panel-body'},
          el.ul(
            {className: 'chat-list list-unstyled', ref: 'chatListRef'},
            chatStore.state.messages.toArray().map(function(m) {
              return el.li(
                {
                  // Use message id as unique key
                  key: m.id
                },
                el.span(
                  {
                    style: {
                      fontFamily: 'monospace'
                    }
                  },
                  helpers.formatDateToTime(m.created_at),
                  ' '
                ),
                m.user ? helpers.roleToLabelElement(m.user.role) : '',
                m.user ? ' ' : '',
                el.code(
                  null,
                  m.user ?
                    // If chat message:
                    m.user.uname :
                    // If system message:
                    'SYSTEM :: ' + m.text
                ),
                m.user ?
                  // If chat message
                  el.span(null, ' ' + m.text) :
                  // If system message
                  ''
              );
            })
          )
        ),
        el.div(
          {className: 'panel-footer'},
          React.createElement(ChatBoxInput, null)
        )
      ),
      // After the chatbox panel
      el.p(
        {
          className: 'text-right text-muted',
          style: { marginTop: '-15px' }
        },
        'Users online: ' + Object.keys(chatStore.state.userList).length + ' ',
        // Show/Hide userlist button
        el.button(
          {
            className: 'btn btn-default btn-xs',
            onClick: this._onUserListToggle
          },
          chatStore.state.showUserList ? 'Hide' : 'Show'
        )
      ),
      // Show userlist
      chatStore.state.showUserList ? React.createElement(ChatUserList, null) : ''
    );
  }
});

var BetBoxChance = React.createClass({
  displayName: 'BetBoxChance',
  // Hookup to stores
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    betStore.on('change', this._onStoreChange);
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    betStore.off('change', this._onStoreChange);
    worldStore.off('change', this._onStoreChange);
  },
  //
  render: function() {
    // 0.00 to 1.00
    var winProb = helpers.multiplierToWinProb(betStore.state.multiplier.num);

    var isError = betStore.state.multiplier.error || betStore.state.wager.error;

    // Just show '--' if chance can't be calculated
    var innerNode;
    if (isError) {
      innerNode = el.span(
        {className: 'text'},
        ' --'
      );
    } else {
      innerNode = el.span(
        {className: 'text'},
        ' ' + (winProb * 100).toFixed(2).toString() + '%'
      );
    }

    return el.div(
      {},
      el.span(
        {className: 'text', style: { fontWeight: 'bold' }},
        'Chance:'
      ),
      innerNode
    );
  }
});

var BetBoxProfit = React.createClass({
  displayName: 'BetBoxProfit',
  // Hookup to stores
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    betStore.on('change', this._onStoreChange);
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    betStore.off('change', this._onStoreChange);
    worldStore.off('change', this._onStoreChange);
  },
  //
  render: function() {
    var profit = betStore.state.wager.num * (betStore.state.multiplier.num - 1);

    var innerNode;
    if (betStore.state.multiplier.error || betStore.state.wager.error) {
      innerNode = el.span(
        {className: 'text'},
        '--'
      );
    } else {
      innerNode = el.span(
        {
          className: 'text',
          style: { color: '#39b54a' }
        },
        '+' + profit.toFixed(2)
      );
    }

    return el.div(
      null,
      el.span(
        {className: 'text', style: { fontWeight: 'bold' }},
        'Profit: '
      ),
      innerNode
    );
  }
});

var BetBoxMultiplier = React.createClass({
  displayName: 'BetBoxMultiplier',
  // Hookup to stores
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    betStore.on('change', this._onStoreChange);
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    betStore.off('change', this._onStoreChange);
    worldStore.off('change', this._onStoreChange);
  },
  //
  _validateMultiplier: function(newStr) {
    var num = parseFloat(newStr, 10);

    // If num is a number, ensure it's at least 0.01x
    // if (Number.isFinite(num)) {
    //   num = Math.max(num, 0.01);
    //   this.props.currBet.setIn(['multiplier', 'str'], num.toString());
    // }

    var isFloatRegexp = /^(\d*\.)?\d+$/;

    // Ensure str is a number
    if (isNaN(num) || !isFloatRegexp.test(newStr)) {
      Dispatcher.sendAction('UPDATE_MULTIPLIER', { error: 'INVALID_MULTIPLIER' });
      // Ensure multiplier is >= 1.00x
    } else if (num < 1.01) {
      Dispatcher.sendAction('UPDATE_MULTIPLIER', { error: 'MULTIPLIER_TOO_LOW' });
      // Ensure multiplier is <= max allowed multiplier (100x for now)
    } else if (num > 9900) {
      Dispatcher.sendAction('UPDATE_MULTIPLIER', { error: 'MULTIPLIER_TOO_HIGH' });
      // Ensure no more than 2 decimal places of precision
    } else if (helpers.getPrecision(num) > 2) {
      Dispatcher.sendAction('UPDATE_MULTIPLIER', { error: 'MULTIPLIER_TOO_PRECISE' });
      // multiplier str is valid
    } else {
      Dispatcher.sendAction('UPDATE_MULTIPLIER', {
        num: num,
        error: null
      });
    }
  },
  _onMultiplierChange: function(e) {
    console.log('Multiplier changed');
    var str = e.target.value;
    console.log('You entered', str, 'as your multiplier');
    Dispatcher.sendAction('UPDATE_MULTIPLIER', { str: str });
    this._validateMultiplier(str);
  },
  render: function() {
    return el.div(
      {className: 'form-group'},
      el.p(
        {className: 'text',style: {marginBottom: '5px'}},
        el.strong(
          {
            style: betStore.state.multiplier.error ? { color: 'red' } : {}
          },
          'Multiplier:')
      ),
      el.div(
        {className: 'input-group'},
        el.input(
          {
            type: 'text',
            value: betStore.state.multiplier.str,
            className: 'form-control',
            id: 'input-multi',
            onChange: this._onMultiplierChange,
            disabled: !!worldStore.state.isLoading
          }
        ),
        el.span(
          {className: 'input-group-addon', style: {background: 'rgb(0, 85, 149)',border: 'none',color: '#ddd'}},
          'X'
        )
      )
    );
  }
});

var BetBoxWager = React.createClass({
  displayName: 'BetBoxWager',
  // Hookup to stores
  _onStoreChange: function() {
    this.forceUpdate();
  },
  _onBalanceChange: function() {
    // Force validation when user logs in
    // TODO: Re-force it when user refreshes
    Dispatcher.sendAction('UPDATE_WAGER', {});
  },
  componentDidMount: function() {
    betStore.on('change', this._onStoreChange);
    worldStore.on('change', this._onStoreChange);
    worldStore.on('user_update', this._onBalanceChange);
  },
  componentWillUnmount: function() {
    betStore.off('change', this._onStoreChange);
    worldStore.off('change', this._onStoreChange);
    worldStore.off('user_update', this._onBalanceChange);
  },
  _onWagerChange: function(e) {
    var str = e.target.value;
    betStore.state.basebet.num = Number(str);
    Dispatcher.sendAction('UPDATE_WAGER', { str: str });
  },
  _onHalveWager: function() {
    var newWager = Math.round(betStore.state.wager.num / 2);
    betStore.state.basebet.num = Number(newWager);
    Dispatcher.sendAction('UPDATE_WAGER', { str: newWager.toString() });
  },
  _onDoubleWager: function() {
    var n = betStore.state.wager.num * 2;
    betStore.state.basebet.num = Number(n);
    Dispatcher.sendAction('UPDATE_WAGER', { str: n.toString() });

  },
  _onMaxWager: function() {
    // If user is logged in, use their balance as max wager
    var balanceBits;
    if (worldStore.state.user) {
      balanceBits = Math.floor(worldStore.state.user.balance / 100);
    } else {
      balanceBits = 42000;
    }
    Dispatcher.sendAction('UPDATE_WAGER', { str: balanceBits.toString() });
  },
  //
  render: function() {
    var style1 = { marginBottom: '5px' };
    var style2 = { backgroundColor: 'rgb(0, 85, 149) !important', backgroundImage: 'none', color: '#ddd', textShadow: 'none', fontSize: '11px' };
    var style3 = { backgroundColor: 'rgb(0, 85, 149) !important', backgroundImage: 'none', color: '#ddd', textShadow: 'none' };
    return el.div(
      {className: 'form-group'},
      el.p(
        {className: 'text',style: {marginBottom: '5px'}},
        el.strong(
          // If wagerError, make the label red
          betStore.state.wager.error ? { style: {color: 'red'} } : null,
          'Wager:')
      ),
      el.input(
        {
          value: betStore.state.wager.str,
          type: 'text',
          className: 'form-control',
          style: style1,
          onChange: this._onWagerChange,
          disabled: !!worldStore.state.isLoading,
          placeholder: 'Bits'
        }
      ),
      el.div(
        {className: 'col-md-12', style: {padding: '0px'}},
        el.div(
          {className: 'col-xs-4', style: {textAlign: 'center', padding: '0px'}},
          el.button(
            {
              className: 'BetButtons',
              type: 'button',
              style: style2,
              onClick: this._onHalveWager
            },
            'half' + '\n', worldStore.state.hotkeysEnabled ? el.kbd(null, 'X') : ''
          )
        ),
        el.div(
          {className: 'col-xs-4', style: {textAlign: 'center', padding: '0px'}},
          el.button(
            {
              className: 'BetButtons',
              type: 'button',
              style: style2,
              onClick: this._onDoubleWager
            },
            'double' + '\n', worldStore.state.hotkeysEnabled ? el.kbd(null, 'C') : ''
          )
        ),
        el.div(
          {className: 'col-xs-4', style: {textAlign: 'center', padding: '0px'}},
          el.button(
            {
              className: 'BetButtons',
              type: 'button',
              style: style3,
              onClick: this._onMaxWager
            },
            'max'
          )
        )
      )
    );
  }
});

var BetBoxButton = React.createClass({
  displayName: 'BetBoxButton',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    worldStore.on('change', this._onStoreChange);
    betStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    worldStore.off('change', this._onStoreChange);
    betStore.off('change', this._onStoreChange);
  },
  getInitialState: function() {
    return { waitingForServer: false };
  },
  // cond is '>' or '<'
  _makeBetHandler: function(cond) {
    var self = this;

    console.assert(cond === '<' || cond === '>');

    return function(e) {
      console.log('Placing bet...');

      // Indicate that we are waiting for server response
      self.setState({ waitingForServer: true });

      var hash = betStore.state.nextHash;
      console.assert(typeof hash === 'string');

      var wagerSatoshis = betStore.state.wager.num * 100;
      var multiplier = betStore.state.multiplier.num;

      var betProfit;

      if (worldStore.state.currTab === 'MY_BETS') {
        if (betStore.state.multiplier.num <= 2.00){
           c = 'rgba(51, 153, 0, 0.4)';
           img = document.getElementById("greenbubble");
        };

        if (betStore.state.multiplier.num > 2.00 && betStore.state.multiplier.num <= 5.00){
           c = 'rgba(255, 205, 0, 0.4)';
           img = document.getElementById("yellowbubble");
        };

        if (betStore.state.multiplier.num > 5.00 && betStore.state.multiplier.num <= 10.00){
           c = 'rgba(204, 0, 0, 0.4)';
           img = document.getElementById("redbubble");
        };
      };
      var payoutSatoshis = wagerSatoshis * multiplier;

      var number = helpers.calcNumber(
        cond, helpers.multiplierToWinProb(multiplier)
      );

      var params = {
        wager: wagerSatoshis,
        client_seed: 0, // TODO
        hash: hash,
        cond: cond,
        target: number,
        payout: payoutSatoshis
      };

      MoneyPot.placeSimpleDiceBet(params, {
        success: function(bet) {
          console.log('Successfully placed bet:', bet);
          // Append to bet list
          betProfit = bet.profit;
          // We don't get this info from the API, so assoc it for our use
          bet.meta = {
            cond: cond,
            number: number,
            hash: hash,
            isFair: CryptoJS.SHA256(bet.secret + '|' + bet.salt).toString() === hash
          };

        if (worldStore.state.currTab === 'MY_BETS' || worldStore.state.currTab === 'FAUCET') {
          Bubbles.push(new Bubble(img,c,bet.outcome,bet.profit,worldStore.state.user.uname.substr(0,4)));
          BubbleStart();
          };

          // Sync up with the bets we get from socket
          bet.wager = wagerSatoshis;
          bet.uname = worldStore.state.user.uname;

          Dispatcher.sendAction('NEW_BET', bet);

          // Update next bet hash
          Dispatcher.sendAction('SET_NEXT_HASH', bet.next_hash);

          // Update user balance
          Dispatcher.sendAction('UPDATE_USER', {
            balance: worldStore.state.user.balance + bet.profit
          });
        },
        error: function(xhr) {
          console.log('Error');
          if (xhr.responseJSON && xhr.responseJSON) {
            alert(xhr.responseJSON.error);
          } else {
            alert('Internal Error');
          }
        },
        complete: function() {
          self.setState({ waitingForServer: false });
          // Force re-validation of wager
          /*Dispatcher.sendAction('UPDATE_WAGER', {
            str: betStore.state.wager.str
          });*/
          if(betStore.state.betnumbers.str > 1){
            if(betStore.state.increaselose.str >= 100){
              
              if(betProfit < 0){
                betStore.state.wager.num = betStore.state.wager.num*betStore.state.increaselose.str/100;
              }
              if(betProfit > 0){
                betStore.state.wager.num = betStore.state.basebet.num;
              }
              if(cond === '<'){
              $('#bet-lo').click();
              betStore.state.betnumbers.str = betStore.state.betnumbers.str-1;
              }else if(cond === '>') {
              $('#bet-hi').click();
              betStore.state.betnumbers.str = betStore.state.betnumbers.str-1;
              }
            }
          }
          if(betStore.state.betnumbers.str <= 1){
            Dispatcher.sendAction('UPDATE_WAGER', {
              str: betStore.state.wager.str
            });
          }
        }
      });
    };
  },
  render: function() {
    var innerNode;

    // TODO: Create error prop for each input
    var error = betStore.state.wager.error || betStore.state.multiplier.error;

    if (worldStore.state.isLoading) {
      // If app is loading, then just disable button until state change
      innerNode = el.button(
        {type: 'button', disabled: true, className: 'btn btn-lg btn-block btn-default'},
        'Loading...'
      );
    } else if (error) {
      // If there's a betbox error, then render button in error state

      var errorTranslations = {
        'CANNOT_AFFORD_WAGER': 'You cannot afford wager',
        'INVALID_WAGER': 'Invalid wager',
        'INVALID_MULTIPLIER': 'Invalid multiplier',
        'MULTIPLIER_TOO_PRECISE': 'Multiplier too precise',
        'MULTIPLIER_TOO_HIGH': 'Multiplier too high',
        'MULTIPLIER_TOO_LOW': 'Multiplier too low'
      };

      innerNode = el.button(
        {type: 'button',
         disabled: true,
         className: 'btn btn-lg btn-block btn-danger'},
        errorTranslations[error] || 'Invalid bet'
      );
    } else if (worldStore.state.user) {
      // If user is logged in, let them submit bet
      innerNode =
        el.div(
          {className: 'row'},
          // bet lo
          el.div(
            {className: 'col-xs-6'},
            el.button(
              {
                id: 'bet-lo',
                type: 'button',
                className: 'btn btn-lg btn-primary btn-block',
                onClick: this._makeBetHandler('<'),
                disabled: !!this.state.waitingForServer
              },
              'Bet Lo ', worldStore.state.hotkeysEnabled ? el.kbd(null, 'L') : ''
            )
          ),
          // bet hi
          el.div(
            {className: 'col-xs-6'},
            el.button(
              {
                id: 'bet-hi',
                type: 'button',
                className: 'btn btn-lg btn-primary btn-block',
                onClick: this._makeBetHandler('>'),
                disabled: !!this.state.waitingForServer
              },
              'Bet Hi ', worldStore.state.hotkeysEnabled ? el.kbd(null, 'H') : ''
            )
          )
        );
    } else {
      // If user isn't logged in, give them link to /oauth/authorize
      innerNode = el.a(
        {
          href: config.mp_browser_uri + '/oauth/authorize' +
            '?app_id=' + config.app_id +
            '&redirect_uri=' + config.redirect_uri,
          className: 'btn btn-lg btn-block btn-success'
        },
        'Login with MoneyPot'
      );
    }

    return el.div(
      null,
      el.div(
        {className: 'col-md-2',}/*,
        (this.state.waitingForServer) ?
          el.span(
            {
              className: 'glyphicon glyphicon-refresh rotate',
              style: { marginTop: '15px' }
            }
          ) : ''*/
      ),
      el.div(
        {className: 'col-md-8',style: {marginBottom: '29px'}},
        innerNode
      )
    );
  }
});

var BetBoxAutoBetting = React.createClass({
  displayName: 'BetBoxAutoBetting',
  // Hookup to stores
  _onStoreChange: function() {
    this.forceUpdate();
  },
  _onBalanceChange: function() {
    // Force validation when user logs in
    // TODO: Re-force it when user refreshes
    Dispatcher.sendAction('UPDATE_WAGER', {});
  },
  componentDidMount: function() {
    betStore.on('change', this._onStoreChange);
    worldStore.on('change', this._onStoreChange);
    worldStore.on('user_update', this._onBalanceChange);
  },
  componentWillUnmount: function() {
    betStore.off('change', this._onStoreChange);
    worldStore.off('change', this._onStoreChange);
    worldStore.off('user_update', this._onBalanceChange);
  },
  _onBetNumbers: function(e) {
    var str = e.target.value;
    Dispatcher.sendAction('UPDATE_BETNUMBERS', { str: str });
  },
  _onIncreaseLose: function(e) {
    var str = e.target.value;
    Dispatcher.sendAction('UPDATE_INCREASELOSE', { str: str });
  },
  _onClick: function() {
Dispatcher.sendAction('UPDATE_BETNUMBERS', {str: 0});
  },
  //
  render: function() {                                                                          
    var style1 = { marginBottom: '5px' };
    return el.div(
      {className: 'form-group'},
      el.span(
        {className: 'span-text'},
        'Number of Bets :'
      ),
      el.input(
        {
          value: betStore.state.betnumbers.str,
          type: 'text',
          className: 'form-control',
          style: style1,
          onChange: this._onBetNumbers,
          disabled: !!worldStore.state.isLoading,
          placeholder: 'Number of bets',
          id: 'num-bets'
        }
      ),
      el.span(
        {className: 'span-text'},
        'Increase on Lose (%):'
      ),
      el.input(
        {
          value: betStore.state.increaselose.str,
          type: 'text',
          className: 'form-control',
          style: style1,
          onChange: this._onIncreaseLose,
          disabled: !!worldStore.state.isLoading,
          placeholder: '% Increase',
          id: 'inc-lose'
        }
      ),
      el.button(
        {
          className: 'BetButtons',
          style: {position: 'relative', left: '50%', marginLeft: '-25px', backgroundColor: 'rgb(0, 85, 149)', color: '#ddd'},
          onClick: this._onClick,
          id: 'stop-button'
        },
        'Stop'
      )
    );
  }
});

var BubbleButtons = React.createClass({
  displayName: 'BubbleButtons',
  render: function() {
    return el.div(
      {style: {textAlign: 'center', marginBottom: worldStore.state.hotkeysEnabled ? '15px' : '25px'}},
      null,
      el.span({className: 'Buttons'},
        React.createElement(RButLo2, null),
        React.createElement(RButLo1, null),
        React.createElement(YButLo2, null),
        React.createElement(YButLo1, null),
        React.createElement(GButLo, null),
        React.createElement(BlankButton, null),
        React.createElement(GButHi, null),
        React.createElement(YButHi1, null),
        React.createElement(YButHi2, null),
        React.createElement(RButHi1, null),
        React.createElement(RButHi2, null)
        )
      );
  }
});

var RButLo2 = React.createClass({
	displayName: 'RButLo2',
  _onClick: function() {
    Dispatcher.sendAction('UPDATE_MULTIPLIER', { num: 99.00 });
    document.getElementById("bet-lo").click();
  },
	render: function() { 
		return  el.button({className:'BetButtons',id:'redbutton',onClick:this._onClick,"data-tooltip":'BET LO (<1.00)', style: {top: worldStore.state.hotkeysEnabled ? '-10px' : ''}},'99x' + '\n', worldStore.state.hotkeysEnabled ? el.kbd(null, 'Q') : '')
		}
});

var RButLo1 = React.createClass({
	displayName: 'RButLo1',
  _onClick: function() {
    Dispatcher.sendAction('UPDATE_MULTIPLIER', { num: 10.00 });
    document.getElementById("bet-lo").click();
  },
	render: function() { 
		return  el.button({className:'BetButtons',id:'redbutton',onClick:this._onClick,"data-tooltip":'BET LO (<9.90)', style: {top: worldStore.state.hotkeysEnabled ? '-10px' : ''}},'10x' + '\n', worldStore.state.hotkeysEnabled ? el.kbd(null, 'W') : '')
		}
});

var YButLo2 = React.createClass({
	displayName: 'YButLo2',
  _onClick: function() {
    Dispatcher.sendAction('UPDATE_MULTIPLIER', { num: 5.00 });
    document.getElementById("bet-lo").click();
  },
	render: function() { 
		return  el.button({className:'BetButtons',id:'yellowbutton',onClick:this._onClick,"data-tooltip":'BET LO (<19.80)', style: {top: worldStore.state.hotkeysEnabled ? '-10px' : ''}},'5x' + '\n', worldStore.state.hotkeysEnabled ? el.kbd(null, 'E') : '')
		}
});

var YButLo1 = React.createClass({
	displayName: 'YButLo1',
  _onClick: function() {
    Dispatcher.sendAction('UPDATE_MULTIPLIER', { num: 3.00 });
    document.getElementById("bet-lo").click();
  },
	render: function() { 
		return  el.button({className:'BetButtons',id:'yellowbutton',onClick:this._onClick,"data-tooltip":'BET LO (<33.00)', style: {top: worldStore.state.hotkeysEnabled ? '-10px' : ''}},'3x' + '\n', worldStore.state.hotkeysEnabled ? el.kbd(null, 'R') : '')
		}
});

var GButLo = React.createClass({
	displayName: 'GButLo',
  _onClick: function() {
    Dispatcher.sendAction('UPDATE_MULTIPLIER', { num: 2.00 });
    document.getElementById("bet-lo").click();
  },
	render: function() { 
		return  el.button({className:'BetButtons',id:'greenbutton',onClick:this._onClick,"data-tooltip":'BET LO (<49.50)', style: {top: worldStore.state.hotkeysEnabled ? '-10px' : ''}},'2x' + '\n', worldStore.state.hotkeysEnabled ? el.kbd(null, 'T') : '')
		}
});

var BlankButton = React.createClass({
	displayName: 'BlankButton',
  _onClick: function() {
  },
	render: function() { 
		return  el.button({className:'BetButtons',id:'blankbutton',onClick:this._onClick ,disabled: true},'|')
		}
});

var GButHi = React.createClass({
	displayName: 'GButHi',
  _onClick: function() {
    Dispatcher.sendAction('UPDATE_MULTIPLIER', { num: 2.00 });
    document.getElementById("bet-hi").click();
  },
	render: function() { 
		return  el.button({className:'BetButtons',id:'greenbutton',onClick:this._onClick,"data-tooltip":'BET HI (>50.49)', style: {top: worldStore.state.hotkeysEnabled ? '-10px' : ''}},'2x' + '\n', worldStore.state.hotkeysEnabled ? el.kbd(null, 'Y') : '')
		}
});

var YButHi1 = React.createClass({
	displayName: 'YButHi1',
  _onClick: function() {
    Dispatcher.sendAction('UPDATE_MULTIPLIER', { num: 3.00 });
    document.getElementById("bet-hi").click();
  },
	render: function() { 
		return  el.button({className:'BetButtons',id:'yellowbutton',onClick:this._onClick,"data-tooltip":'BET HI (>66.99)', style: {top: worldStore.state.hotkeysEnabled ? '-10px' : ''}},'3x' + '\n', worldStore.state.hotkeysEnabled ? el.kbd(null, 'U') : '')
		}
});

var YButHi2 = React.createClass({
	displayName: 'YButHi2',
  _onClick: function() {
    Dispatcher.sendAction('UPDATE_MULTIPLIER', { num: 5.00 });
    document.getElementById("bet-hi").click();
  },
	render: function() { 
		return  el.button({className:'BetButtons',id:'yellowbutton',onClick:this._onClick,"data-tooltip":'BET HI (>80.19)', style: {top: worldStore.state.hotkeysEnabled ? '-10px' : ''}},'5x' + '\n', worldStore.state.hotkeysEnabled ? el.kbd(null, 'I') : '')
		}
});

var RButHi1 = React.createClass({
	displayName: 'RButHi1',
  _onClick: function() {
    Dispatcher.sendAction('UPDATE_MULTIPLIER', { num: 10.00 });
    document.getElementById("bet-hi").click();
  },
	render: function() { 
		return  el.button({className:'BetButtons',id:'redbutton',onClick:this._onClick,"data-tooltip":'BET HI (>90.09)', style: {top: worldStore.state.hotkeysEnabled ? '-10px' : ''}},'10x' + '\n', worldStore.state.hotkeysEnabled ? el.kbd(null, 'O') : '')
		}
});

var RButHi2 = React.createClass({
	displayName: 'RButHi2',
  _onClick: function() {
    Dispatcher.sendAction('UPDATE_MULTIPLIER', { num: 99.00 });
    document.getElementById("bet-hi").click();
  },
	render: function() { 
		return  el.button({className:'BetButtons',id:'redbutton',onClick:this._onClick,"data-tooltip":'BET HI (>98.99)', style: {top: worldStore.state.hotkeysEnabled ? '-10px' : ''}},'99x' + '\n', worldStore.state.hotkeysEnabled ? el.kbd(null, 'P') : '')
		}
});

var HotkeyToggle = React.createClass({
  displayName: 'HotkeyToggle',
  _onClick: function() {
    Dispatcher.sendAction('TOGGLE_HOTKEYS');
  },
  render: function() {
    return (
      el.div(
        {className: 'text-center'},
        el.button(
          {
            type: 'button',
            className: 'btn btn-default btn-sm btn-block',
            id: 'toggle-button',
            onClick: this._onClick,
            style: { marginTop: '-15px' }
          },
          'Hotkeys: ',
          worldStore.state.hotkeysEnabled ?
            el.span({className: 'label label-success'}, 'ON') :
          el.span({className: 'label label-default'}, 'OFF')
        )
      )
    );
  }
});

var OldstyleToggle = React.createClass({
  displayName: 'OldstyleToggle',
  _onClick: function() {
    Dispatcher.sendAction('TOGGLE_OLDSTYLE');
  },
  render: function() {
    return (
      el.div(
        {className: 'text-center'},
        el.button(
          {
            type: 'button',
            className: 'btn btn-default btn-sm btn-block',
            id: 'toggle-button',
            onClick: this._onClick,
            style: { marginTop: '-15px' }
          },
          'Oldstyle: ',
          worldStore.state.oldstyleEnabled ?
            el.span({className: 'label label-success'}, 'ON') :
          el.span({className: 'label label-default'}, 'OFF')
        )
      )
    );
  }
});

var AutobettingToggle = React.createClass({
  displayName: 'AutobettingToggle',
  _onClick: function() {
    Dispatcher.sendAction('TOGGLE_AUTOBETTING');
  },
  render: function() {
    return (
      el.div(
        {className: 'text-center'},
        el.button(
          {
            type: 'button',
            className: 'btn btn-default btn-sm btn-block',
            id: 'toggle-button',
            onClick: this._onClick,
            style: { marginTop: '-15px' }
          },
          'Autobet: ',
          worldStore.state.autobettingEnabled ?
            el.span({className: 'label label-success'}, 'ON') :
          el.span({className: 'label label-default'}, 'OFF')
        )
      )
    );
  }
});

var SoundToggle = React.createClass({
  displayName: 'SoundToggle',
  _onClick: function() {
    Dispatcher.sendAction('TOGGLE_SOUND');
  },
  render: function() {
    return (
      el.div(
        {className: 'text-center'},
        el.button(
          {
            type: 'button',
            className: 'btn btn-default btn-sm btn-block',
            id: 'toggle-button',
            onClick: this._onClick,
            style: { marginTop: '11px' }
          },
          'Sound: ',
          worldStore.state.soundEnabled ?
            el.span({className: 'label label-success'}, 'ON') :
          el.span({className: 'label label-default'}, 'OFF')
        )
      )
    );
  }
});

var BetBox = React.createClass({
  displayName: 'BetBox',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    worldStore.off('change', this._onStoreChange);
  },
  render: function() {
    return el.div(
      null,
      el.div(
        {className: 'panel panel-default', style: {background: 'none', border: 'none'}},
        el.div({className:'BubbleAction',id:'bubble-board',style:{height: '550px'}},
          el.canvas({id:'game',height: '400',width: '600'})
        ),
        el.div(
          {className: 'panel-body'},
          el.div(
            {className: 'row'},
            el.div(
              {className: 'col-xs-3', id: 'wager-panel'},
              React.createElement(BetBoxWager, null)
            ),
            el.div(
              {className: 'col-xs-3', id: 'multiplier-panel', style: {display: worldStore.state.oldstyleEnabled ? 'block' : 'none'}},
              React.createElement(BetBoxMultiplier, null)
            ),
            el.div(
              {className: 'col-xs-3', id: 'autobet-panel'},
              worldStore.state.autobettingEnabled ? React.createElement(BetBoxAutoBetting, null) : ''
            ),
            // HR
//            el.div(
//              {className: 'row'},
//              el.div(
//                {className: 'col-xs-12'},
//                el.hr(null)
//              )
//            ),
            // Bet info bar
            el.div(
              {className: 'col-xs-3', id: 'detail-panel'},
              null,
              el.div(
                {className: 'col-sm-12', style: {padding: '0px'}},
                worldStore.state.oldstyleEnabled ? React.createElement(BetBoxProfit, null) : ''
              ),
              el.div(
                {className: 'col-sm-12', style: {padding: '0px'}},
                worldStore.state.oldstyleEnabled ? React.createElement(BetBoxChance, null) : ''
              )
            )
          )
        ),
        el.div(
          {className: 'panel-footer clearfix', style: {marginTop: '-50px', display: worldStore.state.oldstyleEnabled ? 'block' : 'none'}},
          React.createElement(BetBoxButton, null)
        ),
        el.div(
          {className: 'panel-footer clearfix', style: {marginTop: '-50px'}},
          worldStore.state.oldstyleEnabled ? '' : React.createElement(BubbleButtons, null)
        ),
        el.div(
          {className: 'panel-footer clearfix'},
          el.div(
            {className: 'col-xs-3'}
          ),
          el.div(
            {className: 'col-xs-2'},
            React.createElement(HotkeyToggle, null)
          ),
          el.div(
            {className: 'col-xs-2'},
            React.createElement(OldstyleToggle, null)
          ),
          el.div(
            {className: 'col-xs-2'},
            React.createElement(AutobettingToggle, null)
          )
        )
      )
    );
  }
});

var Tabs = React.createClass({
  displayName: 'Tabs',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    worldStore.off('change', this._onStoreChange);
  },
  _makeTabChangeHandler: function(tabName) {
    var self = this;
    return function() {
      Dispatcher.sendAction('CHANGE_TAB', tabName);
    };
  },
  render: function() {
    return el.ul(
      {className: 'nav nav-tabs'},
      el.li(
        {className: worldStore.state.currTab === 'ALL_BETS' ? 'active' : ''},
        el.a(
          {
            href: 'javascript:void(0)',
            onClick: this._makeTabChangeHandler('ALL_BETS')
          },
          'All Bets'
        )
      ),
      // Only show MY BETS tab if user is logged in
      !worldStore.state.user ? '' :
        el.li(
          {className: worldStore.state.currTab === 'MY_BETS' ? 'active' : ''},
          el.a(
            {
              href: 'javascript:void(0)',
              onClick: this._makeTabChangeHandler('MY_BETS')
            },
            'My Bets'
          )
        ),
      // Display faucet tab even to guests so that they're aware that
      // this casino has one.
      !config.recaptcha_sitekey ? '' :
        el.li(
          {className: worldStore.state.currTab === 'FAUCET' ? 'active' : ''},
          el.a(
            {
              href: 'javascript:void(0)',
              onClick: this._makeTabChangeHandler('FAUCET')
            },
            el.span(null, 'Faucet ')
          )
        )
    );
  }
});

var MyBetsTabContent = React.createClass({
  displayName: 'MyBetsTabContent',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    worldStore.off('change', this._onStoreChange);
  },
  render: function() {
    return el.div(
      {className: 'col-gold-sm col-sm-6', style: {float: 'right'}},
      null,
      el.table(
        {className: 'table'},
        el.thead(
          null,
          el.tr(
            null,
            el.th(null, 'ID'),
            el.th(null, 'User'),
            el.th(null, 'Wager'),
            el.th(null, 'Target'),
            el.th(null, 'Roll'),
            el.th(null, 'Profit'),
            el.th(null, 'Time')
          )
        ),
        el.tbody(
          null,
          worldStore.state.bets.toArray().map(function(bet) {
            return el.tr(
              {
                key: bet.bet_id || bet.id
              },
              // bet id
              el.td(
                null,
                el.a(
                  {
                    href: config.mp_browser_uri + '/bets/' + (bet.bet_id || bet.id),
                    target: '_blank'
                  },
                  bet.bet_id || bet.id
                )
              ),
              // User
              el.td(
                null,
                el.a(
                  {
                    href: config.mp_browser_uri + '/users/' + bet.uname,
                    target: '_blank'
                  },
                  bet.uname
                )
              ),
              // wager
              el.td(
                null,
                helpers.round10(bet.wager/100, -2),
                ' bits'
              ),
              // target
              el.td(
                null,
                bet.meta.cond + bet.meta.number.toFixed(2)
              ),
              // roll
              el.td(
                null,
                bet.outcome
              ),
              // profit
              el.td(
                {style: {color: bet.profit > 0 ? 'green' : 'red'}},
                bet.profit > 0 ?
                  '+' + helpers.round10(bet.profit/100, -2) :
                  helpers.round10(bet.profit/100, -2),
                ' bits'
              ),
              // Time
              el.td(
                null,
                helpers.formatDateToTime(bet.created_at)
              )
            );
          }).reverse()
        )
      )
    );
  }
});

var FaucetTabContent = React.createClass({
  displayName: 'FaucetTabContent',
  getInitialState: function() {
    return {
      // SHOW_RECAPTCHA | SUCCESSFULLY_CLAIM | ALREADY_CLAIMED | WAITING_FOR_SERVER
      faucetState: 'SHOW_RECAPTCHA',
      // :: Integer that's updated after the claim from the server so we
      // can show user how much the claim was worth without hardcoding it
      // - It will be in satoshis
      claimAmount: undefined
    };
  },
  // This function is extracted so that we can call it on update and mount
  // when the window.grecaptcha instance loads
  _renderRecaptcha: function() {
    worldStore.state.grecaptcha.render(
      'recaptcha-target',
      {
        sitekey: config.recaptcha_sitekey,
        callback: this._onRecaptchaSubmit
      }
    );
  },
  // `response` is the g-recaptcha-response returned from google
  _onRecaptchaSubmit: function(response) {
    var self = this;
    console.log('recaptcha submitted: ', response);

    self.setState({ faucetState: 'WAITING_FOR_SERVER' });

    MoneyPot.claimFaucet(response, {
      // `data` is { claim_id: Int, amount: Satoshis }
      success: function(data) {
        Dispatcher.sendAction('UPDATE_USER', {
          balance: worldStore.state.user.balance + data.amount
        });
        self.setState({
          faucetState: 'SUCCESSFULLY_CLAIMED',
          claimAmount: data.amount
        });
        // self.props.faucetClaimedAt.update(function() {
        //   return new Date();
        // });
      },
      error: function(xhr, textStatus, errorThrown) {
        if (xhr.responseJSON && xhr.responseJSON.error === 'FAUCET_ALREADY_CLAIMED') {
          self.setState({ faucetState: 'ALREADY_CLAIMED' });
        }
      }
    });
  },
  // This component will mount before window.grecaptcha is loaded if user
  // clicks the Faucet tab before the recaptcha.js script loads, so don't assume
  // we have a grecaptcha instance
  componentDidMount: function() {
    if (worldStore.state.grecaptcha) {
      this._renderRecaptcha();
    }

    worldStore.on('grecaptcha_loaded', this._renderRecaptcha);
  },
  componentWillUnmount: function() {
    worldStore.off('grecaptcha_loaded', this._renderRecaptcha);
  },
  render: function() {

    // If user is not logged in, let them know only logged-in users can claim
    if (!worldStore.state.user) {
      return el.p(
        {className: 'lead'},
        'You must login to claim faucet'
      );
    }

    var innerNode;
    // SHOW_RECAPTCHA | SUCCESSFULLY_CLAIMED | ALREADY_CLAIMED | WAITING_FOR_SERVER
    switch(this.state.faucetState) {
    case 'SHOW_RECAPTCHA':
      innerNode = el.div(
        { id: 'recaptcha-target' },
        !!worldStore.state.grecaptcha ? '' : 'Loading...'
      );
      break;
    case 'SUCCESSFULLY_CLAIMED':
      innerNode = el.div(
        null,
        'Successfully claimed ' + this.state.claimAmount/100 + ' bits.' +
          // TODO: What's the real interval?
          ' You can claim again in 5 minutes.'
      );
      break;
    case 'ALREADY_CLAIMED':
      innerNode = el.div(
        null,
        'ALREADY_CLAIMED'
      );
      break;
    case 'WAITING_FOR_SERVER':
      innerNode = el.div(
        null,
        'WAITING_FOR_SERVER'
      );
      break;
    default:
      alert('Unhandled faucet state');
      return;
    }

    return el.div(
      null,
      innerNode
    );
  }
});

// props: { bet: Bet }
var BetRow = React.createClass({
  displayName: 'BetRow',
  render: function() {
    var bet = this.props.bet;
    return el.tr(
      {},
      // bet id
      el.td(
        null,
        el.a(
          {
            href: config.mp_browser_uri + '/bets/' + (bet.bet_id || bet.id),
            target: '_blank'
          },
          bet.bet_id || bet.id
        )
      ),
      // User
      el.td(
        null,
        el.a(
          {
            href: config.mp_browser_uri + '/users/' + bet.uname,
            target: '_blank'
          },
          bet.uname
        )
      ),
      // Wager
      el.td(
        null,
        helpers.round10(bet.wager/100, -2),
        ' bits'
      ),
      // Target
      el.td(
        {
          className: 'text-right',
          style: {
          //  fontFamily: 'monospace'
          }
        },
        bet.cond + bet.target.toFixed(2)
      ),
      // // Roll
      // el.td(
      //   null,
      //   bet.outcome
      // ),
      // Visual
      el.td(
        {
          style: {
            //position: 'relative'
            //fontFamily: 'monospace'
          }
        },
        // progress bar container
/*        el.div(
          {
            className: 'progress',
            style: {
              minWidth: '100px',
              position: 'relative',
              marginBottom: 0,
              // make it thinner than default prog bar
              height: '10px'
            }
          },
          el.div(
            {
              className: 'progress-bar ' +
                (bet.profit >= 0 ?
                 'progress-bar-success' : 'progress-bar-grey') ,
              style: {
                float: bet.cond === '<' ? 'left' : 'right',
                width: bet.cond === '<' ?
                  bet.target.toString() + '%' :
                  (100 - bet.target).toString() + '%'
              }
            }
          ),
          el.div(
            {
              style: {
                position: 'absolute',
                left: 0,
                top: 0,
                width: bet.outcome.toString() + '%',
                borderRight: '3px solid #333',
                height: '100%'
              }
            }
          )
        ),*/
        // arrow container
        el.div(
          {
            style: {
              position: 'relative',
              width: '100%',
              height: '15px'
            }
          },'' + bet.outcome.toFixed(2)
/*          // arrow
          el.div(
            {
              style: {
                position: 'absolute',
                top: 0,
                left: (bet.outcome - 1).toString() + '%'
              }
            },
            el.div(
              {
                style: {
                  width: '5em',
                  marginLeft: '-10px'
                }
              },
              // el.span(
              //   //{className: 'glyphicon glyphicon-triangle-top'}
              //   {className: 'glyphicon glyphicon-arrow-up'}
              // ),
              el.span(
                {style: {fontFamily: 'monospace'}},
                '' + bet.outcome
              )
            )
          )*/
        )
      ),
      // Profit
      el.td(
        {
          style: {
            color: bet.profit > 0 ? 'green' : 'red'
          }
        },
        bet.profit > 0 ?
          '+' + helpers.round10(bet.profit/100, -2) :
          helpers.round10(bet.profit/100, -2),
        ' bits'
      ),
      // Time
      el.td(
        null,
        helpers.formatDateToTime(bet.created_at)
      )
    );
  }
});

var AllBetsTabContent = React.createClass({
  displayName: 'AllBetsTabContent',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    worldStore.off('change', this._onStoreChange);
  },
  render: function() {
    return el.div(
      {className: 'col-gold-sm col-sm-6', style: {float: 'right'}},
      null,
      el.table(
        {className: 'table'},
        el.thead(
          null,
          el.tr(
            null,
            el.th(null, 'ID'),
            el.th(null, 'User'),
            el.th(null, 'Wager'),
            el.th({className: 'text-right'}, 'Target'),
            // el.th(null, 'Roll'),
            el.th(null, 'Outcome'),
            el.th(null, 'Profit'),
            el.th(null, 'Time')
          )
        ),
        el.tbody(
          null,
          worldStore.state.allBets.toArray().map(function(bet) {
            return React.createElement(BetRow, { bet: bet, key: bet.bet_id || bet.id });
          }).reverse()
        )
      )
    );
  }
});

var TabContent = React.createClass({
  displayName: 'TabContent',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    worldStore.off('change', this._onStoreChange);
  },
  render: function() {
    switch(worldStore.state.currTab) {
      case 'FAUCET':
        return React.createElement(FaucetTabContent, null);
      case 'MY_BETS':
        return React.createElement(MyBetsTabContent, null);
      case 'ALL_BETS':
        return React.createElement(AllBetsTabContent, null);
      default:
        alert('Unsupported currTab value: ', worldStore.state.currTab);
        break;
    }
  }
});

var Footer = React.createClass({
  displayName: 'Footer',
  render: function() {
    return el.div(
      {
        className: 'text-center text-muted',
        style: {
          marginTop: '20px'
        }
      },
      'Powered by ',
      el.a(
        {
          href: 'https://www.moneypot.com'
        },
        'Moneypot'
      )
    );
  }
});

var App = React.createClass({
  displayName: 'App',
  render: function() {
    return el.div(
      {className: 'container-fluid'},
      // Navbar
      React.createElement(Navbar, null),
      // BetBox & ChatBox
      el.div(
        {className: 'row'},
        el.div(
          {className: 'col-gold-lg'},
          React.createElement(BetBox, null)
        ),
        el.div(
          {className: 'col-gold-sm col-sm-6'},
          React.createElement(ChatBox, null)
        ),
        // Tabs
        el.div(
          {className: 'col-gold-sm col-sm-6', style: {marginTop: '15px', float: 'right'}},
          React.createElement(Tabs, null)
        ),
        // Tab Contents
        React.createElement(TabContent, null)
      ),
      // Footer
      React.createElement(Footer, null)
    );
  }
});

React.render(
  React.createElement(App, null),
  document.getElementById('app')
);

// If not accessToken,
// If accessToken, then
if (!worldStore.state.accessToken) {
  Dispatcher.sendAction('STOP_LOADING');
  connectToChatServer();
} else {
  // Load user from accessToken
  MoneyPot.getTokenInfo({
    success: function(data) {
      console.log('Successfully loaded user from tokens endpoint', data);
      var user = data.auth.user;
      Dispatcher.sendAction('USER_LOGIN', user);
    },
    error: function(err) {
      console.log('Error:', err);
    },
    complete: function() {
      Dispatcher.sendAction('STOP_LOADING');
      connectToChatServer();
    }
  });
  // Get next bet hash
  MoneyPot.generateBetHash({
    success: function(data) {
      Dispatcher.sendAction('SET_NEXT_HASH', data.hash);
    }
  });
  // Fetch latest all-bets to populate the all-bets tab
  MoneyPot.listBets({
    success: function(bets) {
      console.log('[MoneyPot.listBets]:', bets);
      Dispatcher.sendAction('INIT_ALL_BETS', bets.reverse());
    },
    error: function(err) {
      console.error('[MoneyPot.listBets] Error:', err);
    }
  });
}

////////////////////////////////////////////////////////////
// Hook up to chat server

function connectToChatServer() {
  console.log('Connecting to chat server. AccessToken:',
              worldStore.state.accessToken);

  socket = io(config.chat_uri);

  socket.on('connect', function() {
    console.log('[socket] Connected');

    socket.on('disconnect', function() {
      console.log('[socket] Disconnected');
    });

    // When subscribed to DEPOSITS:

    socket.on('unconfirmed_balance_change', function(payload) {
      console.log('[socket] unconfirmed_balance_change:', payload);
      Dispatcher.sendAction('UPDATE_USER', {
        unconfirmed_balance: payload.balance
      });
    });

    socket.on('balance_change', function(payload) {
      console.log('[socket] (confirmed) balance_change:', payload);
      Dispatcher.sendAction('UPDATE_USER', {
        balance: payload.balance
      });
    });

    // message is { text: String, user: { role: String, uname: String} }
    socket.on('new_message', function(message) {
      console.log('[socket] Received chat message:', message);
      Dispatcher.sendAction('NEW_MESSAGE', message);
    });

    socket.on('user_joined', function(user) {
      console.log('[socket] User joined:', user);
      Dispatcher.sendAction('USER_JOINED', user);
    });

    // `user` is object { uname: String }
    socket.on('user_left', function(user) {
      console.log('[socket] User left:', user);
      Dispatcher.sendAction('USER_LEFT', user);
    });

    socket.on('new_bet', function(bet) {
      console.log('[socket] New bet:', bet);

      // Ignore bets that aren't of kind "simple_dice".
      if (bet.kind !== 'simple_dice') {
        console.log('[weird] received bet from socket that was NOT a simple_dice bet');
        return;
      }

      Dispatcher.sendAction('NEW_ALL_BET', bet);
    });

    // Received when your client doesn't comply with chat-server api
    socket.on('client_error', function(text) {
      console.warn('[socket] Client error:', text);
    });

    // Once we connect to chat server, we send an auth message to join
    // this app's lobby channel.

    var authPayload = {
      app_id: config.app_id,
      access_token: worldStore.state.accessToken,
      subscriptions: ['CHAT', 'DEPOSITS', 'BETS']
    };

    socket.emit('auth', authPayload, function(err, data) {
      if (err) {
        console.log('[socket] Auth failure:', err);
        return;
      }
      console.log('[socket] Auth success:', data);
      Dispatcher.sendAction('INIT_CHAT', data);
    });
  });
}

// This function is passed to the recaptcha.js script and called when
// the script loads and exposes the window.grecaptcha object. We pass it
// as a prop into the faucet component so that the faucet can update when
// when grecaptcha is loaded.
function onRecaptchaLoad() {
  Dispatcher.sendAction('GRECAPTCHA_LOADED', grecaptcha);
}

$(document).on('keydown', function(e) {
  var H = 72, L = 76, C = 67, X = 88, Q = 81, W = 87, E = 69, R = 82, T = 84, Y = 89, U = 85, I = 73, O = 79, P = 80, keyCode = e.which;

  // Bail is hotkeys aren't currently enabled to prevent accidental bets
  if (!worldStore.state.hotkeysEnabled) {
    return;
  }

  // Bail if it's not a key we care about
  if (keyCode !== H && keyCode !== L && keyCode !== X && keyCode !== C && keyCode !== Q && keyCode !== W && keyCode !== E && keyCode !== R && keyCode !== T && keyCode !== Y && keyCode !== U && keyCode !== I && keyCode !== O && keyCode !== P) {
    return;
  }

  // TODO: Remind self which one I need and what they do ^_^;;
  e.stopPropagation();
  e.preventDefault();

  switch(keyCode) {
    case C:  // Increase wager
      var upWager = betStore.state.wager.num * 2;
      Dispatcher.sendAction('UPDATE_WAGER', {
        num: upWager,
        str: upWager.toString()
      });
      break;
    case X:  // Decrease wager
      var downWager = Math.floor(betStore.state.wager.num / 2);
      Dispatcher.sendAction('UPDATE_WAGER', {
        num: downWager,
        str: downWager.toString()
      });
      break;
    case L:  // Bet lo
      $('#bet-lo').click();
      break;
    case H:  // Bet hi
      $('#bet-hi').click();
      break;
    case Q:
      Dispatcher.sendAction('UPDATE_MULTIPLIER', { num: 99.00 });
      document.getElementById("bet-lo").click();
      break;
    case W:
      Dispatcher.sendAction('UPDATE_MULTIPLIER', { num: 10.00 });
      document.getElementById("bet-lo").click();
      break;
    case E:
      Dispatcher.sendAction('UPDATE_MULTIPLIER', { num: 5.00 });
      document.getElementById("bet-lo").click();
      break;
    case R:
      Dispatcher.sendAction('UPDATE_MULTIPLIER', { num: 3.00 });
      document.getElementById("bet-lo").click();
      break;
    case T:
      Dispatcher.sendAction('UPDATE_MULTIPLIER', { num: 2.00 });
      document.getElementById("bet-lo").click();
      break;
    case Y:
      Dispatcher.sendAction('UPDATE_MULTIPLIER', { num: 2.00 });
      document.getElementById("bet-hi").click();
      break;
    case U:
      Dispatcher.sendAction('UPDATE_MULTIPLIER', { num: 3.00 });
      document.getElementById("bet-hi").click();
      break;
    case I:
      Dispatcher.sendAction('UPDATE_MULTIPLIER', { num: 5.00 });
      document.getElementById("bet-hi").click();
      break;
    case O:
      Dispatcher.sendAction('UPDATE_MULTIPLIER', { num: 10.00 });
      document.getElementById("bet-hi").click();
      break;
    case P:
      Dispatcher.sendAction('UPDATE_MULTIPLIER', { num: 99.00 });
      document.getElementById("bet-hi").click();
      break;
    default:
      return;
  }
});

window.addEventListener('message', function(event) {
  if (event.origin === config.mp_browser_uri && event.data === 'UPDATE_BALANCE') {
    Dispatcher.sendAction('START_REFRESHING_USER');
  }
}, false);

var canvas = document.getElementById("game");
var ctx = canvas.getContext("2d");
var greenimg = document.getElementById("greenbubble");
var yellowimg = document.getElementById("yellowbubble");
var redimg = document.getElementById("redbubble");

var canvasWidth = canvas.width;
var canvasHeight = canvas.height;

(function() {
    var lastTime = 0;
    var vendors = ['webkit', 'moz'];
    for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
        window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
        window.cancelAnimationFrame =
          window[vendors[x]+'CancelAnimationFrame'] || window[vendors[x]+'CancelRequestAnimationFrame'];
    }

    if (!window.requestAnimationFrame)
        window.requestAnimationFrame = function(callback, element) {
            var currTime = new Date().getTime();
            var timeToCall = Math.max(0, 16 - (currTime - lastTime));
            var id = window.setTimeout(function() { callback(currTime + timeToCall); },
              timeToCall);
            lastTime = currTime + timeToCall;
            return id;
        };

    if (!window.cancelAnimationFrame)
        window.cancelAnimationFrame = function(id) {
            clearTimeout(id);
        };
}());


ctx.lineWidth = 2;

// Circle class.
//  has update(dt) and draw as public method.
function Bubble(img,color,result,profit,name) {

    this.x = 300;
    this.y = 400;
    this.size = 10;
    this.minSize = 10;
    this.endSize = 40;
    this.color = color;
    this.name = name;
    this.speed = 60 / 1000;
    this.update = function (dt) {  
      
      this.y = this.y-2;
      if (this.size>=this.endSize) {
        this.size = this.endSize;
      }
      if (this.y > 350) {
        this.size += dt * this.speed;
        this.text = (Math.random()*99.99+0.01).toFixed(2);
      }

      if (result < 1.00){
      if (this.y <= 350) {
        this.x=this.x-1.668;
        this.size = this.size+(Math.cos(this.y*0.10)*0.2);
        this.text = result;
      }
      if (this.y <= 50 && profit > 0) {
        this.x=this.x+1.668;
        this.size -= dt * this.speed/1.25;
      }
      if (this.y <= 50 && profit <= 0) {
        this.y = this.y-50;
        this.size = this.minSize;
        pop(this.x, this.y+25, color);
        BubblePop();
      }
      if (this.y <= 0) {
        Bubbles.splice(this.y, 1);
      }
      }

      if (result<9.90 && result>=1.00){
      if (this.y <= 350) {
        this.x=this.x-1.334;
        this.size = this.size+(Math.cos(this.y*0.10)*0.2);
        this.text = result;
      }
      if (this.y <= 50 && profit > 0) {
        this.x=this.x+1.334;
        this.size -= dt * this.speed/1.25;
      }
      if (this.y <= 50 && profit <= 0) {
        this.y = this.y-50;
        this.size = this.minSize;
        pop(this.x, this.y+25, color);
        BubblePop();
      }
      if (this.y <= 0) {
        Bubbles.splice(this.y, 1);
      }
      }

      if (result<19.80 && result>=9.90){
      if (this.y <= 350) {
        this.x=this.x-1;
        this.size = this.size+(Math.cos(this.y*0.10)*0.2);
        this.text = result;
      }
      if (this.y <= 50 && profit > 0) {
        this.x=this.x+1;
        this.size -= dt * this.speed/1.25;
      }
      if (this.y <= 50 && profit <= 0) {
        this.y = this.y-50;
        this.size = this.minSize;
        pop(this.x, this.y+25, color);
        BubblePop();
      }
      if (this.y <= 0) {
        Bubbles.splice(this.y, 1);
      }
      }

      if (result<33.00 && result>=19.80){
      if (this.y <= 350) {
        this.x=this.x-0.666;
        this.size = this.size+(Math.cos(this.y*0.10)*0.2);
        this.text = result;
      }
      if (this.y <= 50 && profit > 0) {
        this.x=this.x+0.666;
        this.size -= dt * this.speed/1.25;
      }
      if (this.y <= 50 && profit <= 0) {
        this.y = this.y-50;
        this.size = this.minSize;
        pop(this.x, this.y+25, color);
        BubblePop();
      }
      if (this.y <= 0) {
        Bubbles.splice(this.y, 1);
      }
      }

      if (result<49.50 && result>=33.00){
      if (this.y <= 350) {
        this.x=this.x-0.334;
        this.size = this.size+(Math.cos(this.y*0.10)*0.2);
        this.text = result;
      }
      if (this.y <= 50 && profit > 0) {
        this.x=this.x+0.334;
        this.size -= dt * this.speed/1.25;
      }
      if (this.y <= 50 && profit <= 0) {
        this.y = this.y-50;
        this.size = this.minSize;
        pop(this.x, this.y+25, color);
        BubblePop();
      }
      if (this.y <= 0) {
        Bubbles.splice(this.y, 1);
      }
      }

      if (result>=49.50 && result<=50.49){
      if (this.y <= 350) {
        this.x=this.x;
        this.size = this.size+(Math.cos(this.y*0.10)*0.2);
        this.text = result;
      }
      if (this.y <= 50 && profit > 0) {
        this.x=this.x;
        this.size -= dt * this.speed/1.25;
      }
      if (this.y <= 50 && profit <= 0) {
        this.y = this.y-50;
        this.size = this.minSize;
        pop(this.x, this.y+25, color);
        BubblePop();
      }
      if (this.y <= 0) {
        Bubbles.splice(this.y, 1);
      }
      }

      if (result>50.49 && result<=66.99){
      if (this.y <= 350) {
        this.x=this.x+0.334;
        this.size = this.size+(Math.cos(this.y*0.10)*0.2);
        this.text = result;
      }
      if (this.y <= 50 && profit > 0) {
        this.x=this.x-0.334;
        this.size -= dt * this.speed/1.25;
      }
      if (this.y <= 50 && profit <= 0) {
        this.y = this.y-50;
        this.size = this.minSize;
        pop(this.x, this.y+25, color);
        BubblePop();
      }
      if (this.y <= 0) {
        Bubbles.splice(this.y, 1);
      }
      }

      if (result>66.99 && result<=80.19){
      if (this.y <= 350) {
        this.x=this.x+0.666;
        this.size = this.size+(Math.cos(this.y*0.10)*0.2);
        this.text = result;
      }
      if (this.y <= 50 && profit > 0) {
        this.x=this.x-0.666;
        this.size -= dt * this.speed/1.25;
      }
      if (this.y <= 50 && profit <= 0) {
        this.y = this.y-50;
        this.size = this.minSize;
        pop(this.x, this.y+25, color);
        BubblePop();
      }
      if (this.y <= 0) {
        Bubbles.splice(this.y, 1);
      }
      }

      if (result>80.19 && result<=90.09){
      if (this.y <= 350) {
        this.x=this.x+1;
        this.size = this.size+(Math.cos(this.y*0.10)*0.2);
        this.text = result;
      }
      if (this.y <= 50 && profit > 0) {
        this.x=this.x-1;
        this.size -= dt * this.speed/1.25;
      }
      if (this.y <= 50 && profit <= 0) {
        this.y = this.y-50;
        this.size = this.minSize;
        pop(this.x, this.y+25, color);
        BubblePop();
      }
      if (this.y <= 0) {
        Bubbles.splice(this.y, 1);
      }
      }

      if (result>90.09 && result<=98.99){
      if (this.y <= 350) {
        this.x=this.x+1.334;
        this.size = this.size+(Math.cos(this.y*0.10)*0.2);
        this.text = result;
      }
      if (this.y <= 50 && profit > 0) {
        this.x=this.x-1.334;
        this.size -= dt * this.speed/1.25;
      }
      if (this.y <= 50 && profit <= 0) {
        this.y = this.y-50;
        this.size = this.minSize;
        pop(this.x, this.y+25, color);
        BubblePop();
      }
      if (this.y <= 0) {
        Bubbles.splice(this.y, 1);
      }
      }

      if (result>98.99){
      if (this.y <= 350) {
        this.x=this.x+1.668;
        this.size = this.size+(Math.cos(this.y*0.10)*0.2);
        this.text = result;
      }
      if (this.y <= 50 && profit > 0) {
        this.x=this.x-1.668;
        this.size -= dt * this.speed/1.25;
      }
      if (this.y <= 50 && profit <= 0) {
        this.y = this.y-50;
        this.size = this.minSize;
        pop(this.x, this.y+25, color);
        BubblePop();
      }
      if (this.y <= 0) {
        Bubbles.splice(this.y, 1);
      }
      }
    }
    
    this.draw = function () {
        ctx.globalAlpha = 0.5;
        ctx.drawImage(img, this.x-this.size, this.y-this.size-10, this.size*2, this.size*2);
        ctx.globalAlpha = 1.0;
        this.text;
        this.font = (this.size*0.4) + "px Verdana";
        this.textWidth = ctx.measureText(this.text).width;
        this.textHeight = ctx.measureText("0").width;
        ctx.fillStyle = "black";
        ctx.font = this.font;
        ctx.wrapText(this.text + "\n\n" + this.name,this.x+3,this.y-5,50,8);
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
    }
}

// scene contains all that needs to be drawn and updated
var Bubbles = [];

function animate() {
    // keep alive
    requestAnimationFrame(animate);
    //  handle time
    var callTime = Date.now();
    var dt = callTime - lastTime;
    lastTime = callTime;
    // clear screen
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    // draw
    for (var i = 0; i < Bubbles.length; i++) {
        var thisObject = Bubbles[i];
        thisObject.draw();
    }
    // update
    for (var i = 0; i < Bubbles.length; i++) {
        var thisObject = Bubbles[i];
        thisObject.update(dt);
    }
}
var lastTime = Date.now();

animate();

function shoot() {
  var c = 'rgba(51, 153, 0, 0.5)';
  var result = (Math.random()*99.99+0.01).toFixed(2);
  var profit = (Math.floor((Math.random() * 3) - 1));
  var img = document.getElementById("greenbubble");
  var name = 'mich';
    Bubbles.push(new Bubble(img,c, result, profit, name));
}

////////////////////////////////////
// jQuery bubble pop animation thanks to Ben Ridout
// Ben Ridout (c) 2013 - http://BenRidout.com/?q=bubblepop

function r2d(x) {
    return x / (Math.PI / 180);
  }

  function d2r(x) {
    return x * (Math.PI / 180);
  }

  function pop(start_x, start_y, color) {
    arr = [];
    angle = 0;
    particles = [];
    offset_x = $("#dummy_debris").width() / 2;
    offset_y = $("#dummy_debris").height() / 2;

    for (i = 0; i < 10; i++) {
      rad = d2r(angle);
      x = Math.cos(rad)*(80+Math.random()*20);
      y = Math.sin(rad)*(80+Math.random()*20);
      arr.push([start_x + x, start_y + y]);
      z = $('<div class="debris" />');
      z.css({
          "background-color": color,
          "left": start_x - offset_x,
          "top": start_y - offset_x
      }).appendTo($("#content"));
      particles.push(z);
      angle += 360/10;
    }
    
    $.each(particles, function(i, v){
      $(v).show();
      $(v).animate(
        {
          top: arr[i][1], 
          left: arr[i][0],
          width: 4, 
          height: 4, 
          opacity: 0
        }, 600, function(){$(v).remove()
      });
    });
  }

CanvasRenderingContext2D.prototype.wrapText = function (text, x, y, maxWidth, lineHeight) {

    var lines = text.split("\n");

    for (var i = 0; i < lines.length; i++) {

        var words = lines[i].split(' ');
        var line = '';

        for (var n = 0; n < words.length; n++) {
            var testLine = line + words[n] + ' ';
            var metrics = this.measureText(testLine);
            var testWidth = metrics.width;
            if (testWidth > maxWidth && n > 0) {
                this.fillText(line, x, y);
                line = words[n] + ' ';
                y += lineHeight;
            } else {
                line = testLine;
            }
        }

        this.fillText(line, x, y);
        y += lineHeight;
    }
};


/////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////

!function(){var e={},o=null,n=!0,t=!1;try{"undefined"!=typeof AudioContext?o=new AudioContext:"undefined"!=typeof webkitAudioContext?o=new webkitAudioContext:n=!1}catch(r){n=!1}if(!n)if("undefined"!=typeof Audio)try{new Audio}catch(r){t=!0}else t=!0;if(n){var a="undefined"==typeof o.createGain?o.createGainNode():o.createGain();a.gain.value=1,a.connect(o.destination)}var i=function(e){this._volume=1,this._muted=!1,this.usingWebAudio=n,this.ctx=o,this.noAudio=t,this._howls=[],this._codecs=e,this.iOSAutoEnable=!0};i.prototype={volume:function(e){var o=this;if(e=parseFloat(e),e>=0&&1>=e){o._volume=e,n&&(a.gain.value=e);for(var t in o._howls)if(o._howls.hasOwnProperty(t)&&o._howls[t]._webAudio===!1)for(var r=0;r<o._howls[t]._audioNode.length;r++)o._howls[t]._audioNode[r].volume=o._howls[t]._volume*o._volume;return o}return n?a.gain.value:o._volume},mute:function(){return this._setMuted(!0),this},unmute:function(){return this._setMuted(!1),this},_setMuted:function(e){var o=this;o._muted=e,n&&(a.gain.value=e?0:o._volume);for(var t in o._howls)if(o._howls.hasOwnProperty(t)&&o._howls[t]._webAudio===!1)for(var r=0;r<o._howls[t]._audioNode.length;r++)o._howls[t]._audioNode[r].muted=e},codecs:function(e){return this._codecs[e]},_enableiOSAudio:function(){var e=this;if(!o||!e._iOSEnabled&&/iPhone|iPad|iPod/i.test(navigator.userAgent)){e._iOSEnabled=!1;var n=function(){var t=o.createBuffer(1,1,22050),r=o.createBufferSource();r.buffer=t,r.connect(o.destination),"undefined"==typeof r.start?r.noteOn(0):r.start(0),setTimeout(function(){(r.playbackState===r.PLAYING_STATE||r.playbackState===r.FINISHED_STATE)&&(e._iOSEnabled=!0,e.iOSAutoEnable=!1,window.removeEventListener("touc",n,!1))},0)};return window.addEventListener("touc",n,!1),e}}};var u=null,d={};t||(u=new Audio,d={mp3:!!u.canPlayType("audio/mpeg;").replace(/^no$/,""),opus:!!u.canPlayType('audio/ogg; codecs="opus"').replace(/^no$/,""),ogg:!!u.canPlayType('audio/ogg; codecs="vorbis"').replace(/^no$/,""),wav:!!u.canPlayType('audio/wav; codecs="1"').replace(/^no$/,""),aac:!!u.canPlayType("audio/aac;").replace(/^no$/,""),m4a:!!(u.canPlayType("audio/x-m4a;")||u.canPlayType("audio/m4a;")||u.canPlayType("audio/aac;")).replace(/^no$/,""),mp4:!!(u.canPlayType("audio/x-mp4;")||u.canPlayType("audio/mp4;")||u.canPlayType("audio/aac;")).replace(/^no$/,""),weba:!!u.canPlayType('audio/webm; codecs="vorbis"').replace(/^no$/,"")});var l=new i(d),f=function(e){var t=this;t._autoplay=e.autoplay||!1,t._buffer=e.buffer||!1,t._duration=e.duration||0,t._format=e.format||null,t._loop=e.loop||!1,t._loaded=!1,t._sprite=e.sprite||{},t._src=e.src||"",t._pos3d=e.pos3d||[0,0,-.5],t._volume=void 0!==e.volume?e.volume:1,t._urls=e.urls||[],t._rate=e.rate||1,t._model=e.model||null,t._onload=[e.onload||function(){}],t._onloaderror=[e.onloaderror||function(){}],t._onend=[e.onend||function(){}],t._onpause=[e.onpause||function(){}],t._onplay=[e.onplay||function(){}],t._onendTimer=[],t._webAudio=n&&!t._buffer,t._audioNode=[],t._webAudio&&t._setupAudioNode(),"undefined"!=typeof o&&o&&l.iOSAutoEnable&&l._enableiOSAudio(),l._howls.push(t),t.load()};if(f.prototype={load:function(){var e=this,o=null;if(t)return void e.on("loaderror");for(var n=0;n<e._urls.length;n++){var r,a;if(e._format)r=e._format;else{if(a=e._urls[n],r=/^data:audio\/([^;,]+);/i.exec(a),r||(r=/\.([^.]+)$/.exec(a.split("?",1)[0])),!r)return void e.on("loaderror");r=r[1].toLowerCase()}if(d[r]){o=e._urls[n];break}}if(!o)return void e.on("loaderror");if(e._src=o,e._webAudio)_(e,o);else{var u=new Audio;u.addEventListener("error",function(){u.error&&4===u.error.code&&(i.noAudio=!0),e.on("loaderror",{type:u.error?u.error.code:0})},!1),e._audioNode.push(u),u.src=o,u._pos=0,u.preload="auto",u.volume=l._muted?0:e._volume*l.volume();var f=function(){e._duration=Math.ceil(10*u.duration)/10,0===Object.getOwnPropertyNames(e._sprite).length&&(e._sprite={_default:[0,1e3*e._duration]}),e._loaded||(e._loaded=!0,e.on("load")),e._autoplay&&e.play(),u.removeEventListener("canplaythrough",f,!1)};u.addEventListener("canplaythrough",f,!1),u.load()}return e},urls:function(e){var o=this;return e?(o.stop(),o._urls="string"==typeof e?[e]:e,o._loaded=!1,o.load(),o):o._urls},play:function(e,n){var t=this;return"function"==typeof e&&(n=e),e&&"function"!=typeof e||(e="_default"),t._loaded?t._sprite[e]?(t._inactiveNode(function(r){r._sprite=e;var a=r._pos>0?r._pos:t._sprite[e][0]/1e3,i=0;t._webAudio?(i=t._sprite[e][1]/1e3-r._pos,r._pos>0&&(a=t._sprite[e][0]/1e3+a)):i=t._sprite[e][1]/1e3-(a-t._sprite[e][0]/1e3);var u,d=!(!t._loop&&!t._sprite[e][2]),f="string"==typeof n?n:Math.round(Date.now()*Math.random())+"";if(function(){var o={id:f,sprite:e,loop:d};u=setTimeout(function(){!t._webAudio&&d&&t.stop(o.id).play(e,o.id),t._webAudio&&!d&&(t._nodeById(o.id).paused=!0,t._nodeById(o.id)._pos=0,t._clearEndTimer(o.id)),t._webAudio||d||t.stop(o.id),t.on("end",f)},1e3*i),t._onendTimer.push({timer:u,id:o.id})}(),t._webAudio){var _=t._sprite[e][0]/1e3,s=t._sprite[e][1]/1e3;r.id=f,r.paused=!1,p(t,[d,_,s],f),t._playStart=o.currentTime,r.gain.value=t._volume,"undefined"==typeof r.bufferSource.start?d?r.bufferSource.noteGrainOn(0,a,86400):r.bufferSource.noteGrainOn(0,a,i):d?r.bufferSource.start(0,a,86400):r.bufferSource.start(0,a,i)}else{if(4!==r.readyState&&(r.readyState||!navigator.isCocoonJS))return t._clearEndTimer(f),function(){var o=t,a=e,i=n,u=r,d=function(){o.play(a,i),u.removeEventListener("canplaythrough",d,!1)};u.addEventListener("canplaythrough",d,!1)}(),t;r.readyState=4,r.id=f,r.currentTime=a,r.muted=l._muted||r.muted,r.volume=t._volume*l.volume(),setTimeout(function(){r.play()},0)}return t.on("play"),"function"==typeof n&&n(f),t}),t):("function"==typeof n&&n(),t):(t.on("load",function(){t.play(e,n)}),t)},pause:function(e){var o=this;if(!o._loaded)return o.on("play",function(){o.pause(e)}),o;o._clearEndTimer(e);var n=e?o._nodeById(e):o._activeNode();if(n)if(n._pos=o.pos(null,e),o._webAudio){if(!n.bufferSource||n.paused)return o;n.paused=!0,"undefined"==typeof n.bufferSource.stop?n.bufferSource.noteOff(0):n.bufferSource.stop(0)}else n.pause();return o.on("pause"),o},stop:function(e){var o=this;if(!o._loaded)return o.on("play",function(){o.stop(e)}),o;o._clearEndTimer(e);var n=e?o._nodeById(e):o._activeNode();if(n)if(n._pos=0,o._webAudio){if(!n.bufferSource||n.paused)return o;n.paused=!0,"undefined"==typeof n.bufferSource.stop?n.bufferSource.noteOff(0):n.bufferSource.stop(0)}else isNaN(n.duration)||(n.pause(),n.currentTime=0);return o},mute:function(e){var o=this;if(!o._loaded)return o.on("play",function(){o.mute(e)}),o;var n=e?o._nodeById(e):o._activeNode();return n&&(o._webAudio?n.gain.value=0:n.muted=!0),o},unmute:function(e){var o=this;if(!o._loaded)return o.on("play",function(){o.unmute(e)}),o;var n=e?o._nodeById(e):o._activeNode();return n&&(o._webAudio?n.gain.value=o._volume:n.muted=!1),o},volume:function(e,o){var n=this;if(e=parseFloat(e),e>=0&&1>=e){if(n._volume=e,!n._loaded)return n.on("play",function(){n.volume(e,o)}),n;var t=o?n._nodeById(o):n._activeNode();return t&&(n._webAudio?t.gain.value=e:t.volume=e*l.volume()),n}return n._volume},loop:function(e){var o=this;return"boolean"==typeof e?(o._loop=e,o):o._loop},sprite:function(e){var o=this;return"object"==typeof e?(o._sprite=e,o):o._sprite},pos:function(e,n){var t=this;if(!t._loaded)return t.on("load",function(){t.pos(e)}),"number"==typeof e?t:t._pos||0;e=parseFloat(e);var r=n?t._nodeById(n):t._activeNode();if(r)return e>=0?(t.pause(n),r._pos=e,t.play(r._sprite,n),t):t._webAudio?r._pos+(o.currentTime-t._playStart):r.currentTime;if(e>=0)return t;for(var a=0;a<t._audioNode.length;a++)if(t._audioNode[a].paused&&4===t._audioNode[a].readyState)return t._webAudio?t._audioNode[a]._pos:t._audioNode[a].currentTime},pos3d:function(e,o,n,t){var r=this;if(o="undefined"!=typeof o&&o?o:0,n="undefined"!=typeof n&&n?n:-.5,!r._loaded)return r.on("play",function(){r.pos3d(e,o,n,t)}),r;if(!(e>=0||0>e))return r._pos3d;if(r._webAudio){var a=t?r._nodeById(t):r._activeNode();a&&(r._pos3d=[e,o,n],a.panner.setPosition(e,o,n),a.panner.panningModel=r._model||"HRTF")}return r},fade:function(e,o,n,t,r){var a=this,i=Math.abs(e-o),u=e>o?"down":"up",d=i/.01,l=n/d;if(!a._loaded)return a.on("load",function(){a.fade(e,o,n,t,r)}),a;a.volume(e,r);for(var f=1;d>=f;f++)!function(){var e=a._volume+("up"===u?.01:-.01)*f,n=Math.round(1e3*e)/1e3,i=o;setTimeout(function(){a.volume(n,r),n===i&&t&&t()},l*f)}()},fadeIn:function(e,o,n){return this.volume(0).play().fade(0,e,o,n)},fadeOut:function(e,o,n,t){var r=this;return r.fade(r._volume,e,o,function(){n&&n(),r.pause(t),r.on("end")},t)},_nodeById:function(e){for(var o=this,n=o._audioNode[0],t=0;t<o._audioNode.length;t++)if(o._audioNode[t].id===e){n=o._audioNode[t];break}return n},_activeNode:function(){for(var e=this,o=null,n=0;n<e._audioNode.length;n++)if(!e._audioNode[n].paused){o=e._audioNode[n];break}return e._drainPool(),o},_inactiveNode:function(e){for(var o=this,n=null,t=0;t<o._audioNode.length;t++)if(o._audioNode[t].paused&&4===o._audioNode[t].readyState){e(o._audioNode[t]),n=!0;break}if(o._drainPool(),!n){var r;if(o._webAudio)r=o._setupAudioNode(),e(r);else{o.load(),r=o._audioNode[o._audioNode.length-1];var a=navigator.isCocoonJS?"canplaythrough":"loadedmetadata",i=function(){r.removeEventListener(a,i,!1),e(r)};r.addEventListener(a,i,!1)}}},_drainPool:function(){var e,o=this,n=0;for(e=0;e<o._audioNode.length;e++)o._audioNode[e].paused&&n++;for(e=o._audioNode.length-1;e>=0&&!(5>=n);e--)o._audioNode[e].paused&&(o._webAudio&&o._audioNode[e].disconnect(0),n--,o._audioNode.splice(e,1))},_clearEndTimer:function(e){for(var o=this,n=0,t=0;t<o._onendTimer.length;t++)if(o._onendTimer[t].id===e){n=t;break}var r=o._onendTimer[n];r&&(clearTimeout(r.timer),o._onendTimer.splice(n,1))},_setupAudioNode:function(){var e=this,n=e._audioNode,t=e._audioNode.length;return n[t]="undefined"==typeof o.createGain?o.createGainNode():o.createGain(),n[t].gain.value=e._volume,n[t].paused=!0,n[t]._pos=0,n[t].readyState=4,n[t].connect(a),n[t].panner=o.createPanner(),n[t].panner.panningModel=e._model||"equalpower",n[t].panner.setPosition(e._pos3d[0],e._pos3d[1],e._pos3d[2]),n[t].panner.connect(n[t]),n[t]},on:function(e,o){var n=this,t=n["_on"+e];if("function"==typeof o)t.push(o);else for(var r=0;r<t.length;r++)o?t[r].call(n,o):t[r].call(n);return n},off:function(e,o){var n=this,t=n["_on"+e],r=o?o.toString():null;if(r){for(var a=0;a<t.length;a++)if(r===t[a].toString()){t.splice(a,1);break}}else n["_on"+e]=[];return n},unload:function(){for(var o=this,n=o._audioNode,t=0;t<o._audioNode.length;t++)n[t].paused||(o.stop(n[t].id),o.on("end",n[t].id)),o._webAudio?n[t].disconnect(0):n[t].src="";for(t=0;t<o._onendTimer.length;t++)clearTimeout(o._onendTimer[t].timer);var r=l._howls.indexOf(o);null!==r&&r>=0&&l._howls.splice(r,1),delete e[o._src],o=null}},n)var _=function(o,n){if(n in e)return o._duration=e[n].duration,void c(o);if(/^data:[^;]+;base64,/.test(n)){for(var t=atob(n.split(",")[1]),r=new Uint8Array(t.length),a=0;a<t.length;++a)r[a]=t.charCodeAt(a);s(r.buffer,o,n)}else{var i=new XMLHttpRequest;i.open("GET",n,!0),i.responseType="arraybuffer",i.onload=function(){s(i.response,o,n)},i.onerror=function(){o._webAudio&&(o._buffer=!0,o._webAudio=!1,o._audioNode=[],delete o._gainNode,delete e[n],o.load())};try{i.send()}catch(u){i.onerror()}}},s=function(n,t,r){o.decodeAudioData(n,function(o){o&&(e[r]=o,c(t,o))},function(e){t.on("loaderror")})},c=function(e,o){e._duration=o?o.duration:e._duration,0===Object.getOwnPropertyNames(e._sprite).length&&(e._sprite={_default:[0,1e3*e._duration]}),e._loaded||(e._loaded=!0,e.on("load")),e._autoplay&&e.play()},p=function(n,t,r){var a=n._nodeById(r);a.bufferSource=o.createBufferSource(),a.bufferSource.buffer=e[n._src],a.bufferSource.connect(a.panner),a.bufferSource.loop=t[0],t[0]&&(a.bufferSource.loopStart=t[1],a.bufferSource.loopEnd=t[1]+t[2]),a.bufferSource.playbackRate.value=n._rate};"function"==typeof define&&define.amd&&define(function(){return{Howler:l,Howl:f}}),"undefined"!=typeof exports&&(exports.Howler=l,exports.Howl=f),"undefined"!=typeof window&&(window.Howler=l,window.Howl=f)}();

var sound = new Howl({
  urls: ['http://www.bubblesbit.com/sound/BubbleStart.ogg']
}).play();


function BubbleStart() {
var sound = new Howl({
  urls: ['http://www.bubblesbit.com/sound/BubbleStart.ogg']
  });
  worldStore.state.soundEnabled ? sound.play() : '';
}

function BubblePop() {
  var sound = new Howl({
  urls: ['http://www.bubblesbit.com/sound/BubblePop.ogg']
  });
  worldStore.state.soundEnabled ? sound.play() : '';
}

/*function bubbleBackgound() {
    //calculating random color of dream
    var col = 'rgb(' + Math.floor(Math.random() * 0) + ',' + Math.floor(Math.random() * 0) + ',' + Math.floor(Math.random() * 255) + ')';

    //calculating random X position
    var x = Math.floor(Math.random() * window.innerWidth);

    //calculating random Y position
    var y = Math.floor(Math.random() * window.innerHeight);

    //creating the dream and hide
    bubblebg = document.createElement('span');
    bubblebg.className = 'bubblebg';
    bubblebg.style.top = y + 'px';
    bubblebg.style.left = x + 'px';
    bubblebg.style.backgroundColor = col;
    //remove element when animation is complete
    bubblebg.addEventListener("animationstart", function(e) {
        window.setTimeout(startBubbleBg, 500);
    }, false);
  
    bubblebg.addEventListener("animationend", function(e) {
        document.body.removeChild(this);
    }, false);

    document.body.appendChild(bubblebg);
}
function startBubbleBg(){
  window.requestAnimationFrame(bubbleBackgound);
}
startBubbleBg();*/
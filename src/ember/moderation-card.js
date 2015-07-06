var FFZ = window.FrankerFaceZ,
	utils = require("../utils"),
	helpers,

	keycodes = {
		ESC: 27,
		P: 80,
		B: 66,
		T: 84,
		U: 85
		},

	MESSAGE = '<svg class="svg-messages" height="16px" version="1.1" viewBox="0 0 18 18" width="16px" x="0px" y="0px"><path clip-rule="evenodd" d="M1,15V3h16v12H1z M15.354,5.354l-0.707-0.707L9,10.293L3.354,4.646L2.646,5.354L6.293,9l-3.646,3.646l0.707,0.707L7,9.707l1.646,1.646h0.707L11,9.707l3.646,3.646l0.707-0.707L11.707,9L15.354,5.354z" fill-rule="evenodd"></path></svg>',
	CHECK = '<svg class="svg-unban" height="16px" version="1.1" viewBox="0 0 16 16" width="16px" x="0px" y="0px"><path fill-rule="evenodd" clip-rule="evenodd" fill="#888888" d="M6.5,12.75L2,8.25l2-2l2.5,2.5l5.5-5.5l2,2L6.5,12.75z"/></svg>',

	DURATIONS = {},
	duration_string = function(val) {
		if ( val === 1 )
			return 'Purge';

		if ( DURATIONS[val] )
			return DURATIONS[val];

		var weeks, days, hours, minutes, seconds;

		weeks = Math.floor(val / 604800);
		seconds = val % 604800;

		days = Math.floor(seconds / 86400);
		seconds %= 86400;

		hours = Math.floor(seconds / 3600);
		seconds %= 3600;

		minutes = Math.floor(seconds / 60);
		seconds %= 60;

		var out = DURATIONS[val] = (weeks ? weeks + 'w' : '') + ((days || (weeks && (hours || minutes || seconds))) ? days + 'd' : '') + ((hours || ((weeks || days) && (minutes || seconds))) ? hours + 'h' : '') + ((minutes || ((weeks || days || hours) && seconds)) ? minutes + 'm' : '') + (seconds ? seconds + 's' : '');
		return out;
	};


try {
	helpers = window.require && window.require("ember-twitch-chat/helpers/chat-line-helpers");
} catch(err) { }


// ----------------
// Settings
// ----------------

FFZ.settings_info.chat_hover_pause = {
	type: "boolean",
	value: false,

	no_bttv: true,

	category: "Chat Moderation",
	name: "Pause Chat Scrolling on Mouse Hover",
	help: "Automatically prevent the chat from scrolling when moving the mouse over it to prevent moderation mistakes and link mis-clicks.",

	on_update: function(val) {
			if ( ! this._roomv )
				return;

			if ( val )
				this._roomv.ffzEnableFreeze();
			else
				this._roomv.ffzDisableFreeze();
		}
	};


FFZ.settings_info.short_commands = {
	type: "boolean",
	value: true,

	no_bttv: true,
	category: "Chat Moderation",

	name: "Short Moderation Commands",
	help: "Use /t, /b, and /u in chat in place of /timeout, /ban, /unban for quicker moderation, and use /p for 1 second timeouts."
	};


FFZ.settings_info.mod_card_hotkeys = {
	type: "boolean",
	value: false,

	no_bttv: true,
	category: "Chat Moderation",

	name: "Moderation Card Hotkeys",
	help: "With a moderation card selected, press B to ban the user, T to time them out for 10 minutes, P to time them out for 1 second, or U to unban them. ESC closes the card."
	};


FFZ.settings_info.mod_card_history = {
	type: "boolean",
	value: false,

	no_bttv: true,
	category: "Chat Moderation",

	name: "Moderation Card History",
	help: "Display a few of the user's previously sent messages on moderation cards.",

	on_update: function(val) {
			if ( val || ! this.rooms )
				return;

			// Delete all history~!
			for(var room_id in this.rooms) {
				var room = this.rooms[room_id];
				if ( room )
					room.user_history = undefined;
			}
		}
	};


FFZ.settings_info.mod_card_durations = {
	type: "button",
	value: [300, 600, 3600, 43200, 86400, 604800],

	category: "Chat Moderation",
	no_bttv: true,

	name: "Moderation Card Timeout Buttons",
	help: "Add additional timeout buttons to moderation cards with specific durations.",

	method: function() {
			var old_val = this.settings.mod_card_durations.join(", "),
				new_val = prompt("Moderation Card Timeout Buttons\n\nPlease enter a comma-separated list of durations that you would like to have timeout buttons for. Durations must be expressed in seconds.\n\nEnter \"reset\" without quotes to return to the default value.", old_val);

			if ( new_val === null || new_val === undefined )
				return;

			if ( new_val === "reset" )
				new_val = FFZ.settings_info.mod_card_durations.value.join(", ");

			// Split them up.
			new_val = new_val.trim().split(/[ ,]+/);
			var vals = [];

			for(var i=0; i < new_val.length; i++) {
				var val = parseInt(new_val[i]);
				if ( val === 0 )
					val = 1;

				if ( val !== NaN && val > 0 )
					vals.push(val);
			}

			this.settings.set("mod_card_durations", vals);
		}
	};


// ----------------
// Initialization
// ----------------

FFZ.prototype.setup_mod_card = function() {
	this.log("Modifying Mousetrap stopCallback so we can catch ESC.");
	var orig_stop = Mousetrap.stopCallback;
	Mousetrap.stopCallback = function(e, element, combo) {
		if ( element.classList.contains('no-mousetrap') )
			return true;

		return orig_stop(e, element, combo);
	}

	Mousetrap.bind("up up down down left right left right b a enter", function() {
		var el = document.querySelector(".app-main") || document.querySelector(".ember-chat-container");
		el && el.classList.toggle('ffz-flip');
	});


	this.log("Hooking the Ember Moderation Card view.");
	var Card = App.__container__.resolve('component:moderation-card'),
		f = this;

	Card.reopen({
		ffzForceRedraw: function() {
			this.rerender();
		}.observes("cardInfo.isModeratorOrHigher", "cardInfo.user"),

		didInsertElement: function() {
			this._super();
			window._card = this;
			try {
				if ( f.has_bttv )
					return;

				var el = this.get('element'),
					controller = this.get('controller');

				// Style it!
				if ( f.settings.mod_card_hotkeys || (f.settings.mod_card_durations && f.settings.mod_card_durations.length) )
					el.classList.add('ffz-moderation-card');

				// Only do the big stuff if we're mod.
				if ( controller.get('cardInfo.isModeratorOrHigher') ) {
					el.classList.add('ffz-is-mod');
					el.setAttribute('tabindex', 1);

					// Key Handling
					if ( f.settings.mod_card_hotkeys ) {
						el.classList.add('no-mousetrap');

						el.addEventListener('keyup', function(e) {
							var key = e.keyCode || e.which,
								user_id = controller.get('cardInfo.user.id'),
								room = App.__container__.lookup('controller:chat').get('currentRoom');

							if ( key == keycodes.P )
								room.send("/timeout " + user_id + " 1");

							else if ( key == keycodes.B )
								room.send("/ban " + user_id);

							else if ( key == keycodes.T )
								room.send("/timeout " + user_id + " 600");

							else if ( key == keycodes.U )
								room.send("/unban " + user_id);

							else if ( key != keycodes.ESC )
								return;

							controller.send('close');
						});
					}

					var btn_click = function(timeout) {
						var user_id = controller.get('cardInfo.user.id'),
							room = App.__container__.lookup('controller:chat').get('currentRoom');

							if ( timeout === -1 )
								room.send("/unban " + user_id);
							else
								room.send("/timeout " + user_id + " " + timeout);
						},

					btn_make = function(timeout) {
							var btn = document.createElement('button')
							btn.className = 'button';
							btn.innerHTML = duration_string(timeout);
							btn.title = "Timeout User for " + utils.number_commas(timeout) + " Second" + (timeout != 1 ? "s" : "");

							if ( f.settings.mod_card_hotkeys && timeout === 600 )
								btn.title = "(T)" + btn.title.substr(1);
							else if ( f.settings.mod_card_hotkeys &&  timeout === 1 )
								btn.title = "(P)urge - " + btn.title;

							jQuery(btn).tipsy();

							btn.addEventListener('click', btn_click.bind(this, timeout));
							return btn;
						};

					if ( f.settings.mod_card_durations && f.settings.mod_card_durations.length ) {
						// Extra Moderation
						var line = document.createElement('div');
						line.className = 'interface clearfix';

						line.appendChild(btn_make(1));

						var s = document.createElement('span');
						s.className = 'right';
						line.appendChild(s);

						for(var i=0; i < f.settings.mod_card_durations.length; i++)
							s.appendChild(btn_make(f.settings.mod_card_durations[i]));

						el.appendChild(line);

						// Fix Other Buttons
						this.$("button.timeout").remove();
					}

					var ban_btn = el.querySelector('button.ban');
					if ( f.settings.mod_card_hotkeys )
						ban_btn.setAttribute('title', '(B)an User');

					// Unban Button
					var unban_btn = document.createElement('button');
					unban_btn.className = 'unban button glyph-only light';
					unban_btn.innerHTML = CHECK;
					unban_btn.title = (f.settings.mod_card_hotkeys ? "(U)" : "U") + "nban User";

					jQuery(unban_btn).tipsy();
					unban_btn.addEventListener("click", btn_click.bind(this, -1));

					jQuery(ban_btn).after(unban_btn);
				}


				// More Fixing Other Buttons
				var op_btn = el.querySelector('button.mod');
				if ( op_btn ) {
					var is_owner = controller.get('cardInfo.isChannelOwner'),
						user = ffz.get_user();
						can_op = is_owner || (user && user.is_admin) || (user && user.is_staff);

					if ( ! can_op )
						op_btn.parentElement.removeChild(op_btn);
				}


				var msg_btn = el.querySelector(".interface > button");
				if ( msg_btn && msg_btn.classList.contains("message-button") ) {
					msg_btn.innerHTML = MESSAGE;
					msg_btn.classList.add('glyph-only');
					msg_btn.classList.add('message');

					msg_btn.title = "Whisper User";
					jQuery(msg_btn).tipsy();
				}


				// Message History
				if ( f.settings.mod_card_history ) {
					var Chat = App.__container__.lookup('controller:chat'),
						room = Chat && Chat.get('currentRoom'),
						ffz_room = room && f.rooms && f.rooms[room.get('id')],
						user_history = ffz_room && ffz_room.user_history && ffz_room.user_history[controller.get('cardInfo.user.id')];

					if ( user_history && user_history.length ) {
						var history = document.createElement('ul'),
							alternate = false;
						history.className = 'interface clearfix chat-history';

						for(var i=0; i < user_history.length; i++) {
							var line = user_history[i],
								l_el = document.createElement('li');

							l_el.className = 'message-line chat-line';
							l_el.classList.toggle('ffz-alternate', alternate);
							alternate = !alternate;

							if ( line.style )
								l_el.classList.add(line.style);

							l_el.innerHTML = (helpers ? '<span class="timestamp float-left">' + helpers.getTime(line.date) + '</span> ' : '') + '<span class="message">' + (line.style === 'action' ? '*' + line.from + ' ' : '') + f.render_tokens(line.cachedTokens) + '</span>';

							// Banned Links
							var bad_links = l_el.querySelectorAll('a.deleted-link');
							for(var x=0; x < bad_links.length; x++)
								bad_links[x].addEventListener("click", f._deleted_link_click);

							jQuery('a', l_el).tipsy({html:true});
							history.appendChild(l_el);
						}

						el.appendChild(history);

						// Lazy scroll-to-bottom
						history.scrollTop = history.scrollHeight;
					}
				}

				// Reposition the menu if it's off-screen.
				var el_bound = el.getBoundingClientRect(),
					body_bound = document.body.getBoundingClientRect();

				if ( el_bound.bottom > body_bound.bottom ) {
					var offset = el_bound.bottom - body_bound.bottom;
					if ( el_bound.top - offset > body_bound.top )
						el.style.top = (el_bound.top - offset) + "px";
				}

				// Focus the Element
				this.$().draggable({
					start: function() {
						el.focus();
						}});

				el.focus();

			} catch(err) {
				try {
					f.error("ModerationCardView didInsertElement: " + err);
				} catch(err) { }
			}
		}});
}


// ----------------
// Chat Commands
// ----------------

FFZ.chat_commands.purge = function(room, args) {
	if ( ! args || ! args.length )
		return "Purge Usage: /p username [more usernames separated by spaces]";

	if ( args.length > 10 )
		return "Please only purge up to 10 users at once.";

	for(var i=0; i < args.length; i++) {
		var name = args[i];
		if ( name )
			room.room.send("/timeout " + name + " 1");
	}
}

FFZ.chat_commands.p = function(room, args) {
	return FFZ.chat_commands.purge.bind(this)(room, args);
}

FFZ.chat_commands.p.enabled = function() { return this.settings.short_commands; }


FFZ.chat_commands.t = function(room, args) {
	if ( ! args || ! args.length )
		return "Timeout Usage: /t username [duration]";
	room.room.send("/timeout " + args.join(" "));
}

FFZ.chat_commands.t.enabled = function() { return this.settings.short_commands; }


FFZ.chat_commands.b = function(room, args) {
	if ( ! args || ! args.length )
		return "Ban Usage: /b username [more usernames separated by spaces]";

	if ( args.length > 10 )
		return "Please only ban up to 10 users at once.";

	for(var i=0; i < args.length; i++) {
		var name = args[i];
		if ( name )
			room.room.send("/ban " + name);
	}
}

FFZ.chat_commands.b.enabled = function() { return this.settings.short_commands; }


FFZ.chat_commands.u = function(room, args) {
	if ( ! args || ! args.length )
		return "Unban Usage: /u username [more usernames separated by spaces]";

	if ( args.length > 10 )
		return "Please only unban up to 10 users at once.";

	for(var i=0; i < args.length; i++) {
		var name = args[i];
		if ( name )
			room.room.send("/unban " + name);
	}
}

FFZ.chat_commands.u.enabled = function() { return this.settings.short_commands; }
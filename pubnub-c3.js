"use strict";

var eon = eon || {};
eon.subsub = eon.subsub || subsub;
eon.c = {
  create: function(options) {

    options.debug = options.debug || false;

    var clog = function(s, o, e) {

      if(options.debug) {
        if(e) {
          console.log('EON-CHART:', s, o, e); 
        } else {
          console.log('EON-CHART:', s, o);
        }
      }  
    };

    clog('Status:', 'Initialized');

    var self = this;
    var error = false;
    var dateID = "_eon_datetime";

    self.chart = false;
    self.is_dead = false;

    self.pubnub = options.pubnub || PUBNUB || false;

    if(!self.pubnub) {
      error = "PubNub not found. See http://www.pubnub.com/docs/javascript/javascript-sdk.html#_where_do_i_get_the_code";
    }

    options.transform = options.transform || function(m){return m};
    options.channel = options.channel || false;
    options.generate = options.generate || {};
    if(!options.generate.data) {
      options.generate.data = {
        columns: null
      };
    }

    options.flow = options.flow || false;
    if(options.flow) { 
      if(typeof(options.flow) == "boolean") {
        options.flow = {};
      }
      options.flow.length = options.flow.length || 0;
    }
    options.limit = options.limit || 10;
    options.history = options.history || false;

    options.message = options.message || function(){};
    options.connect = options.connect || function(){};

    // x axis definition
    options.x_type = options.x_type || "datetime";
    options.x_id = options.x_id || "";

    if(options.x_type == "custom") {

      options.generate.data.x = options.x_id; 
       
    } else if(options.x_type == "datetime") {

      options.x_id = dateID;
      options.generate.data.x = options.x_id; 

    } else {
      options.x_type = false;
    }

    if(options.x_type) {

      if(!options.generate.axis) {
        options.generate.axis = {}
      }

      // assume js date
      if(!options.generate.axis.x) {

        options.generate.axis.x = {
          type: 'timeseries',
          tick: {
              format: '%Y-%m-%d %H:%M:%S'
          }
        }

      }

    }

    clog('Options:', options);

    if(!options.channel) {
      error = "No channel supplied.";
    }

    var appendDate = function(data, pubnub_date) {

      if(options.x_type == "datetime") {
        clog('PubNub:', 'Appending PubNub datetime to columns.');
        var date = String(pubnub_date).slice(0,-7) * 1000;
        data.push([dateID, new Date(date)]);
      }

      return data;
       
    }

    var all_messages = [];
    var bigload = [];
    var page = function() {

      clog('Status:', 'Restoring from history');

      all_messages = [];
      var i = 0;

      var getAllMessages = function(timetoken) {
      
        clog('History:', 'Retrieving messages from ' + timetoken);

         self.pubnub.history({
          count: options.limit,
          channel: options.channel,
          start: timetoken,
          include_token: true,
          callback: function(payload) {

             var msgs = payload[0];
             var start = payload[1];
             var end = payload[2];

             clog('History:', msgs.length + ' messages found');

             if (msgs !== undefined && msgs.length) {

              i = 0;
               while(i < msgs.length) {
                 all_messages.push(msgs[[i]]);
                 i++;
               }

             }

             if (msgs.length && all_messages[0].length < options.limit) {
              getAllMessages(start);
             } else {

                clog('History:', 'Complete... Rendering');

                i = 0;
                while(i < all_messages.length) {

                  var inArray = false;
                  var a = all_messages[i];

                  a = appendDate(a.message.columns, a.timetoken)
                  bigload = storeData(a, bigload)

                  i++;

                }

                self.chart.load({
                  columns: bigload
                });

             }

           }
         });
       };

       getAllMessages();

    };

    var buffer = [];
    var needsTrim = function() {

      buffer = self.chart.data();

      var i = 0;

      while(i < buffer.length) {

        if(buffer[i].values.length > options.limit) {
          var trimLength = buffer[i].values.length - 1 - options.limit;
          return trimLength;
        }
        i++;

      }

      return false;

    };

    var nextData = [];
    var lastX = null;
    var dataStore = [];

    var storeData = function(data, target) {

      var i = 0;
      if(!target.length) {
        target = JSON.parse(JSON.stringify(data));
      } else {

        while(i < data.length) {

          var found = false;
          for(var j in target) {
            
            if(target[j][0] == data[i][0]) {

              target[j].push(data[i][1]);

              if(target[i].length > options.limit) {
                target[i].splice(1,1);
              }

              found = true;

            }

          }

          if(!found) {
            target.push(data[i]);
          }

          i++;
        }

      }

      return target;

    }

    var kill = function() {

      clog('Status:', 'Chart Animation Disabled');

      self.is_dead = true;

      if(['donut', 'pie', 'gauge'].indexOf(options.generate.data.type) == -1) {
        self.chart.destroy();
      }

      delete self.chart;

    };

    var boot = function() {

      clog('Status:', 'Chart Animation Enabled');
      
      self.is_dead = false;

      options.generate.data.columns = dataStore;

      if(dataStore.length && dataStore[0].length - 1 > options.limit) {
        dataStore = [];
      }

      self.chart = c3.generate(options.generate);

    };

    Visibility.change(function (e, state) {

      if (Visibility.hidden()) {
        kill();
      } else {
        boot();
      }

    });

    var render = function(data) {

      clog('Status:', 'Rendering');

      dataStore = storeData(data, dataStore);

      if(self.is_dead) {

        clog('Render:', 'Tab out of focus.');

      } else {

        if(options.flow) {
          
          clog('Render:', 'Flow enabled, appending to chart.');

          var trimLength = needsTrim();

          if(trimLength)  {
            options.flow.length = 1;
            clog('Render:', 'Data exceeds options.limit, trimming buffer.');
          }

          options.flow.columns = data;
          self.chart.flow(options.flow);

        } else {

          clog('Render:', 'Updating chart.');

          self.chart.load({
            columns: data
          });

        }
         
      }

    }

    var init = function() {

      if(options.history) {
        page();
      }
      
      clog('PubNub:', 'Subscribed to ' + options.channel);

      subsub.subscribe(self.pubnub, options.channel, options.connect, function(message, env, channel) {

        clog('PubNub:', '-------------------');
        clog('PubNub:', 'Received Message', message);

        var message = options.transform(message);

        clog('PubNub:', 'Transforming Message using options.transform');
        message.columns = appendDate(message.columns, env[1]);

        clog('PubNub:', 'Message Result', message);
      
        render(message.columns);

        clog('PubNub:', 'Calling options.message');
        options.message(message, env, channel);

      });

    };

    if(error) {
      console.error("EON: " + error);
    } else {
      init();
      boot();

    }

    return self.chart;

  },
  flatten: function(ob) {

    var toReturn = {};
    
    for (var i in ob) {
      if (!ob.hasOwnProperty(i)) continue;
      
      if ((typeof ob[i]) == 'object') {
        var flatObject = eon.c.flatten(ob[i]);
        for (var x in flatObject) {
          if (!flatObject.hasOwnProperty(x)) continue;
          
          toReturn[i + '.' + x] = flatObject[x];
        }
      } else {
        toReturn[i] = ob[i];
      }
    }
    
    return toReturn;

  }
};
eon.chart = function(o) {
  return new eon.c.create(o);
};

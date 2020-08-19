const debug = require('debug')('plugins-seq-manager')

const METRICS = 'metrics';
const ANALYTICS = 'analytics';

class PluginsSeqManager {

    constructor(config, plugins){
        this.plugins = plugins;        
        this.gloabalPostflowPlugins = this.getPostflowPluginSequence(this.plugins);
        this.config = config;
        this.urlPluginsCache = new Map();
        this.defaultPlugins = plugins.filter( p => p.id === 'analytics' || p.id === 'metrics');
        this.uniqueUrls = new Set();
        
        if ( this.config.edgemicro.plugins && this.config.edgemicro.plugins.disableExcUrlsCache !== true ) {
            debug('Loading all plugins exclude urls in memory');
            this.loadAllUrls();
        } else {
            if (  this.config.edgemicro.plugins && this.config.edgemicro.plugins.excludeUrls  ) {
                this.config.edgemicro.plugins.excludeUrls.split(',').forEach( url =>    this.uniqueUrls.add(url) )
            }
            this.plugins.forEach( p => {
                if ( p.id !== 'analytics' && p.id !== 'metrics'  && this.config[p.id] && this.config[p.id].excludeUrls  ) {
                    this.config[p.id].excludeUrls.split(',').forEach( url => this.uniqueUrls.add(url));
                }
            });
            debug('Unique exclude urls', Array.from(this.uniqueUrls));
        }
    }

    loadAllUrls() {

        // load global excludeUrls
        if (  this.config.edgemicro.plugins && this.config.edgemicro.plugins.excludeUrls  ) {
            this.config.edgemicro.plugins.excludeUrls.split(',').forEach( url => {
                this.urlPluginsCache.set(url, {
                    plugins: this.defaultPlugins,
                    postflowPlugins: this.defaultPlugins
                });
            })
        }
        // load urls from the plugins which are enabled in sequence. 
        this.plugins.forEach( p => {
            if ( p.id !== 'analytics' && p.id !== 'metrics'  && this.config[p.id] ) {
                let excludeUrls = null;
                if ( this.config[p.id].excludeUrls ) {
                    excludeUrls = this.config[p.id].excludeUrls;
                } else if ( p.id === 'quota' && this.config['quotas'] && this.config['quotas'].excludeUrls ) {
                    excludeUrls = this.config['quotas'].excludeUrls;
                }
                if (excludeUrls) {
                    excludeUrls.split(',').forEach( url => {
                            if ( !this.urlPluginsCache.has(url)) {
                                // skip this plugin
                                const pluginSequence = this.plugins.filter( plgn => plgn.id !== p.id)
                                this.urlPluginsCache.set(url, {
                                    plugins:  pluginSequence,
                                    postflowPlugins: this.getPostflowPluginSequence(pluginSequence, url)
                                });
                            } else {
                                let value = this.urlPluginsCache.get(url);
                                value.plugins = value.plugins.filter( plgn => plgn.id !== p.id)
                                value.postflowPlugins = this.getPostflowPluginSequence(value.plugins, url)
                                this.urlPluginsCache.set(url, value);
                            }
                        }
                    );
                }

            }
        });
        debug('Total urls loaded: %d', this.urlPluginsCache.size);
        for (let [url, value] of this.urlPluginsCache) {
            debug('url: %s, plugins:',url,value.plugins.map(p=>p.id));
        }
    }
    setPluginSequence(sourceRequest){
        let pluginsObj = this.getPluginSequence(sourceRequest.url);
        sourceRequest.preflowPluginSequence = pluginsObj.plugins;
        sourceRequest.postflowPluginSequence = pluginsObj.postflowPlugins;
    }

    getPostflowPluginSequence(plugins, url){
      // calculate the postflow sequence
      let pluginsReversed = plugins.slice().reverse();
      if( pluginsReversed && pluginsReversed.length>=2 && 
          pluginsReversed[pluginsReversed.length-1].id === ANALYTICS &&
          pluginsReversed[pluginsReversed.length-2].id === METRICS ){
      
          let temp = pluginsReversed[pluginsReversed.length-1];
          //swap position of metrics with analytics plugin.
          pluginsReversed[pluginsReversed.length-1] = pluginsReversed[pluginsReversed.length-2];
          pluginsReversed[pluginsReversed.length-2] = temp;
      }
      if ( url ) {
        debug('preflow plugin sequence for url:'+url, plugins.map(p => p.id));
        debug('postflow plugin sequence for url:'+url, pluginsReversed.map(p => p.id));
      } else {
        debug('preflow plugin sequence', plugins.map(p => p.id));
        debug('postflow plugin sequence', pluginsReversed.map(p => p.id));
      }
      return pluginsReversed;
    }

    getPluginSequence(url){

        if ( this.urlPluginsCache.has(url) ) {
            return this.urlPluginsCache.get(url);
        } else if( this.uniqueUrls.has(url) ){
                // check if present in global exclude list
            if ( this.config.edgemicro.plugins && this.config.edgemicro.plugins.excludeUrls && 
                this.config.edgemicro.plugins.excludeUrls.split(',').indexOf(url) !== -1 ) {
                return {
                    plugins: this.defaultPlugins,
                    postflowPlugins: this.defaultPlugins
                }
            } else {
                let urlPlugins = [ ...this.defaultPlugins ];
                this.plugins.forEach( p => {
                    if ( p.id === 'quota' && ( !this.config['quotas'] ||
                        !this.config['quotas'].excludeUrls || this.config['quotas'].excludeUrls.split(',').indexOf(url) === -1 )) {
                        urlPlugins.push(p);
                    } else if ( p.id !== 'analytics' && p.id !== 'metrics' &&  ( !this.config[p.id] ||
                            !this.config[p.id].excludeUrls || this.config[p.id].excludeUrls.split(',').indexOf(url) === -1 ) ) {
                        urlPlugins.push(p);
                    }
                });
                return {
                    plugins: urlPlugins,
                    postflowPlugins: this.getPostflowPluginSequence(urlPlugins, url)
                }
            }
        } else {
            return {
                plugins: this.plugins,
                postflowPlugins: this.gloabalPostflowPlugins
            }
        }
        
    }
}

module.exports =  PluginsSeqManager;
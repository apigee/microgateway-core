const debug = require('debug')('plugins-seq-manager')


class PluginsSeqManager {

    constructor(config, plugins){
        this.plugins = plugins;
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
                    isGlobal: true
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
                                this.urlPluginsCache.set(url, {
                                    plugins:  this.plugins.filter( plgn => plgn.id !== p.id)
                                });
                            } else {
                                let value = this.urlPluginsCache.get(url);
                                this.urlPluginsCache.set(url, {
                                    plugins:  value.plugins.filter( plgn => plgn.id !== p.id)
                                });
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

    getPluginSequence(url){

        if ( this.urlPluginsCache.has(url) ) {
            return this.urlPluginsCache.get(url).plugins;
        } else if( this.uniqueUrls.has(url) ){
                // check if present in global exclude list
            if ( this.config.edgemicro.plugins && this.config.edgemicro.plugins.excludeUrls && 
                this.config.edgemicro.plugins.excludeUrls.split(',').indexOf(url) !== -1 ) {
                return this.defaultPlugins;
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
                return urlPlugins;
            }
        } else {
            return this.plugins;
        }
        
    }
}

module.exports =  PluginsSeqManager;
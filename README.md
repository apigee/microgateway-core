# Microgateway-Core
Microgateway-core is a pass through api proxy that events to plugin middleware. The plugin middleware can implement a variety of functions like oauth, spikearrest, and quotas on your apis.

We have provided some default middleware that you can use in the [microgateway-plugin](https://github.com/apigee/microgateway-plugins) repo.

## Usage
To use microgateway-core you must initialize microgateway with a config. The config can be instantiated using the [microgateway-config repo](https://github.com/apigee/microgateway-config).

```javascript
const config = require('microgateway-config');
config.init({source:'<somepath.to.a.yaml.file>', targetDir:'<path.to.write.new.config>', targetFile:'<file.name.of.new.config>'});
const Gateway = require('microgateway-core');
const plugin = {
	init:(config,logging,stats)=>{
		return {
			onrequest:(req,res,options,cb) => {
				cb();
			}
		}
	}
}
config.get({source:'same.yaml',keys:{key: '', secret: ''}},(err,config)=>{
	const gateway = Gateway(config);
	gateway.addPlugin('my-plugin', plugin.init);
	gateway.start((server)=>{
	});
});
```    
## More info
For more info on usage we use the microgateway-core to power our microgateway product. We use a command line utility here.  [https://github.com/apigee/microgateway-cli](https://github.com/apigee/microgateway-cli)

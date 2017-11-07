new Promise((resolve, reject) => {
    if(!process.env.DEBUG_PROFILE_TIME) return resolve();

    console.log(`Profiling application for ${process.env.DEBUG_PROFILE_TIME} ms...`);

    const { spawn } = require('child_process');
    const glob      = require('glob');
    const fs        = require('fs');

    function findLatestProfile(){
        console.log('Finding latest profile...');
        return new Promise((resolve, reject)=> {
            glob('isolate-*', (err, paths) => err ? reject(err) : resolve(paths));
        }).then((paths) => {
            return Promise.all(paths.map((path) =>{
                return new Promise((resolve, reject) => {
                    fs.stat(path, (err, stat) => err ? reject(err) : resolve({ path, stat }));
                });
            }));
        }).then((paths) => {
            return paths.sort((a, b) => b.stat.mtime - a.stat.mtime)[0].path;
        });
    }
    
    const server = spawn('node', ['--prof',  'server.js']);
    server.stdout.pipe(process.stdout);
    server.stderr.pipe(process.stderr);

    server.on('close', (code, signal) => {
        console.log('Restarting server without profiling now');
        resolve();

        findLatestProfile().then((path) => {
            return new Promise((resolve, reject) => {
                console.log('Processing profile...', path);
                
                const profile = spawn('node', ['--prof-process', path]);
                let output = '';
                profile.stdout.on('data', (chunk) => output += chunk);
                profile.on('err', reject);
                profile.on('close', () => resolve(output));
            });
            
        }).then((profile) => {
            console.log('===Profile Output Start============');
            console.log(profile);
            console.log('===Profile Output End============')
        }).catch((err) => {
            console.warn('Error processing profile', err);
        });
    });

    setTimeout(() => server.kill('SIGINT'), process.env.DEBUG_PROFILE_TIME);
}).then(() => {
    require('./server.js');
});
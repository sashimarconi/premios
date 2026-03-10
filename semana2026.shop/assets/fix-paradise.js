// Small runtime shim: rewrite requests from GhostsPay endpoint to Paradise
(function(){
  try{
    const _fetch = window.fetch.bind(window);
    window.fetch = function(input, init){
      try{
        if(typeof input === 'string'){
          if(input.indexOf('/api/ghostspay-pix') !== -1){
            input = input.replace('/api/ghostspay-pix','/api/paradise-pix');
          }
        } else if(input && input.url){
          if(input.url.indexOf('/api/ghostspay-pix') !== -1){
            const newUrl = input.url.replace('/api/ghostspay-pix','/api/paradise-pix');
            input = new Request(newUrl, input);
          }
        }
      }catch(e){}
      return _fetch(input, init);
    };
  }catch(e){}
})();

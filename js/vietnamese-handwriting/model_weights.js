var oReq = new XMLHttpRequest();
oReq.open("GET", "https://huggingface.co/datasets/vunhucuongit/vietnamese-handwriting/resolve/main/weights.bin", true);
oReq.responseType = "arraybuffer";

var weights_meta={'rnn/~/attention_core/~/gru__b': [[0, 1200], [1200]], 'rnn/~/attention_core/~/gru__w_h': [[1200, 481200], [400, 1200]], 'rnn/~/attention_core/~/gru__w_i': [[481200, 682800], [168, 1200]], 'rnn/~/attention_core/~/gru_1__b': [[682800, 684000], [1200]], 'rnn/~/attention_core/~/gru_1__w_h': [[684000, 1164000], [400, 1200]], 'rnn/~/attention_core/~/gru_1__w_i': [[1164000, 1845600], [568, 1200]], 'rnn/~/attention_core/~/gru_2__b': [[1845600, 1846800], [1200]], 'rnn/~/attention_core/~/gru_2__w_h': [[1846800, 2326800], [400, 1200]], 'rnn/~/attention_core/~/gru_2__w_i': [[2326800, 3008400], [568, 1200]], 'rnn/~/attention_core/~/linear__b': [[3008400, 3008430], [30]], 'rnn/~/attention_core/~/linear__w': [[3008430, 3025470], [568, 30]], 'rnn/~/conv1_d__b': [[3025470, 3025635], [165]], 'rnn/~/conv1_d__w': [[3025635, 3161760], [5, 165, 165]], 'rnn/~/embed__embeddings': [[3161760, 3246240], [512, 165]], 'rnn/~/embed_1__embeddings': [[3246240, 3273465], [165, 165]], 'rnn/~/linear__b': [[3273465, 3273586], [121]], 'rnn/~/linear__w': [[3273586, 3321986], [400, 121]]};

// console.log(weights_meta);

var WEIGHTS = {};
var weight_buffer = null;
var W = null;
var w32 = null;
var w16 = null;

oReq.onload = function (oEvent) {
  var arrayBuffer = oReq.response; // Note: not oReq.responseText
  if (arrayBuffer) {
    // convert bfloat16 to float32
    // w16 = new Uint16Array(arrayBuffer)
    // weight_buffer = new SharedArrayBuffer(2*arrayBuffer.byteLength);
    // w32 = new Uint16Array(weight_buffer);
    // for(var i=0; i < w16.length; i++) {
    //     w32[i * 2 + 1] = w16[i];
    // }
    W = new Float32Array(arrayBuffer);
    document.getElementById("btn").innerText = "Buffer arrieved";

    for(var k in weights_meta) {
        info = weights_meta[k];
        offset = info[0];
        shape = info[1];
        WEIGHTS[k] = tf.tensor(W.subarray(offset[0], offset[1]), shape);
    }

    document.getElementById("btn").disabled = false;
    tf.engine().startScope();    
    setTimeout(function() {
        cur_run = cur_run + 1;
        dojob(cur_run);
    }, 0);

    document.getElementById("btn").innerText = "Generate";
  }
};

tf.setBackend('wasm');

tf.ready().then( function() {
        tf.enableProdMode();
        oReq.send(null);
});

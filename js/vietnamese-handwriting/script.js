var log = console.log;
var canvas = document.getElementById("hw-canvas");
var ctx = canvas.getContext("2d");
var RNN_SIZE = 400;
var VOCAB_SIZE = 165;
var NUM_ATT_HEADS=10;
var NUM_GMM_HEADS=20;
var cur_run = 0;
var scale_factor = 0.6;

var randn = function() {
    // Standard Normal random variable using Box-Muller transform.
    var u = Math.random() * 0.999 + 1e-5;
    var v = Math.random() * 0.999 + 1e-5;
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

var rand_truncated_normal = function(low, high) {
    while (true) {
        r = randn();
        if (r >= low && r <= high)
            break;
        // rejection sampling.
    }
    return r;
}

var softplus = function(x) {
    const m = tf.maximum(x, 0.0);
    return tf.add(m, tf.log(tf.add(tf.exp(tf.neg(m)), tf.exp(tf.sub(x, m)))));
}

var char2idx = {'\x00': 0, ' ': 1, '!': 2, '"': 3, '#': 4, '%': 5, '&': 6, "'": 7, '(': 8, ')': 9, '*': 10, ',': 11, '-': 12, '.': 13, '/': 14, '0': 15, '1': 16, '2': 17, '3': 18, '4': 19, '5': 20, '6': 21, '7': 22, '8': 23, '9': 24, ':': 25, ';': 26, '?': 27, 'A': 28, 'B': 29, 'C': 30, 'D': 31, 'E': 32, 'F': 33, 'G': 34, 'H': 35, 'I': 36, 'J': 37, 'K': 38, 'L': 39, 'M': 40, 'N': 41, 'O': 42, 'P': 43, 'Q': 44, 'R': 45, 'S': 46, 'T': 47, 'U': 48, 'V': 49, 'W': 50, 'X': 51, 'Y': 52, 'a': 53, 'b': 54, 'c': 55, 'd': 56, 'e': 57, 'f': 58, 'g': 59, 'h': 60, 'i': 61, 'j': 62, 'k': 63, 'l': 64, 'm': 65, 'n': 66, 'o': 67, 'p': 68, 'q': 69, 'r': 70, 's': 71, 't': 72, 'u': 73, 'v': 74, 'w': 75, 'x': 76, 'y': 77, 'z': 78, 'À': 79, 'Á': 80, 'Â': 81, 'Ô': 82, 'Ú': 83, 'Ý': 84, 'à': 85, 'á': 86, 'â': 87, 'ã': 88, 'è': 89, 'é': 90, 'ê': 91, 'ì': 92, 'í': 93, 'ò': 94, 'ó': 95, 'ô': 96, 'õ': 97, 'ù': 98, 'ú': 99, 'ý': 100, 'Ă': 101, 'ă': 102, 'Đ': 103, 'đ': 104, 'ĩ': 105, 'ũ': 106, 'Ơ': 107, 'ơ': 108, 'Ư': 109, 'ư': 110, 'ạ': 111, 'Ả': 112, 'ả': 113, 'Ấ': 114, 'ấ': 115, 'Ầ': 116, 'ầ': 117, 'ẩ': 118, 'ẫ': 119, 'ậ': 120, 'ắ': 121, 'ằ': 122, 'ẳ': 123, 'ẵ': 124, 'ặ': 125, 'ẹ': 126, 'ẻ': 127, 'ẽ': 128, 'ế': 129, 'Ề': 130, 'ề': 131, 'Ể': 132, 'ể': 133, 'ễ': 134, 'Ệ': 135, 'ệ': 136, 'ỉ': 137, 'ị': 138, 'ọ': 139, 'ỏ': 140, 'Ố': 141, 'ố': 142, 'Ồ': 143, 'ồ': 144, 'ổ': 145, 'ỗ': 146, 'ộ': 147, 'ớ': 148, 'ờ': 149, 'Ở': 150, 'ở': 151, 'ỡ': 152, 'ợ': 153, 'ụ': 154, 'Ủ': 155, 'ủ': 156, 'ứ': 157, 'ừ': 158, 'ử': 159, 'ữ': 160, 'ự': 161, 'ỳ': 162, 'ỷ': 163, 'ỹ': 164};

var gru_core = function(input, weights, state, hidden_size) {
    var [w_h,w_i,b] = weights;
    var [w_h_z,w_h_a] = tf.split(w_h, [2 * hidden_size, hidden_size], 1);
    var [b_z,b_a] = tf.split(b, [2 * hidden_size, hidden_size], 0);
    gates_x = tf.matMul(input, w_i);
    [zr_x,a_x] = tf.split(gates_x, [2 * hidden_size, hidden_size], 1);
    zr_h = tf.matMul(state, w_h_z);
    zr = tf.add(tf.add(zr_x, zr_h), b_z);
    // fix this
    [z,r] = tf.split(tf.sigmoid(zr), 2, 1);
    a_h = tf.matMul(tf.mul(r, state), w_h_a);
    a = tf.tanh(tf.add(tf.add(a_x, a_h), b_a));
    next_state = tf.add(tf.mul(tf.sub(1., z), state), tf.mul(z, a));
    return [next_state, next_state];
};


var generate = function() {
    cur_run = cur_run + 1;
    setTimeout(function() {   
        var counter = 2000;
        tf.disposeVariables();
        
        tf.engine().startScope();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.beginPath();
        dojob(cur_run);
    }, 200);

    return false;
}

var dojob = function(run_id) {
    var text = document.getElementById("user-input").value;
    if (text.length == 0) {
        text = "Chuyển đổi text thành chữ viết tay";
    }

    original_text = text;
    text = '' + text + '            ';

    text = Array.from(text).map(function(e) {
        return char2idx[e]
    })
    var text_embed = WEIGHTS['rnn/~/embed_1__embeddings'];
    indices = tf.tensor1d(text, 'int32');
    text = text_embed.gather(indices);

    var embed = text;

    var writer_embed = WEIGHTS['rnn/~/embed__embeddings'];
    var e = document.getElementById("writers");
    var wid = parseInt(e.value);

    wid = tf.tensor1d([wid], 'int32');
    wid = writer_embed.gather(wid);
    embed = tf.add(wid, embed);



    filter = WEIGHTS['rnn/~/conv1_d__w'];
    embed = tf.conv1d(embed, filter, 1, 'same');
    bias = tf.expandDims(WEIGHTS['rnn/~/conv1_d__b'], 0);
    embed = tf.add(embed, bias);


    // initial state
    var gru0_hx = tf.zeros([1, RNN_SIZE]);
    var gru1_hx = tf.zeros([1, RNN_SIZE]);
    var gru2_hx = tf.zeros([1, RNN_SIZE]);

    var att_location = tf.zeros([1, NUM_ATT_HEADS]);
    var att_context = tf.zeros([1, VOCAB_SIZE]);

    var input = tf.tensor([[0., 0., 1.]]);

    gru0_w_h = WEIGHTS['rnn/~/attention_core/~/gru__w_h'];
    gru0_w_i = WEIGHTS['rnn/~/attention_core/~/gru__w_i'];
    gru0_bias = WEIGHTS['rnn/~/attention_core/~/gru__b'];

    gru1_w_h = WEIGHTS['rnn/~/attention_core/~/gru_1__w_h'];
    gru1_w_i = WEIGHTS['rnn/~/attention_core/~/gru_1__w_i'];
    gru1_bias = WEIGHTS['rnn/~/attention_core/~/gru_1__b'];

    gru2_w_h = WEIGHTS['rnn/~/attention_core/~/gru_2__w_h'];
    gru2_w_i = WEIGHTS['rnn/~/attention_core/~/gru_2__w_i'];
    gru2_bias = WEIGHTS['rnn/~/attention_core/~/gru_2__b'];

    att_w = WEIGHTS['rnn/~/attention_core/~/linear__w'];
    att_b = WEIGHTS['rnn/~/attention_core/~/linear__b'];
    gmm_w = WEIGHTS['rnn/~/linear__w'];
    gmm_b = WEIGHTS['rnn/~/linear__b'];

    var ruler = tf.tensor([...Array(text.shape[0]).keys()]);
    ruler = tf.expandDims(ruler, 1);
    var bias = parseInt(document.getElementById("bias").value) / 100 * 3;


    var cur_x = 10;
    var cur_y = canvas.height/2;
    var path = [];
    var dx = 0.;
    var dy = 0;
    var eos = 1.;
    var counter = 0;


    function loop(my_run_id) {
        if (my_run_id < cur_run) {
            tf.disposeVariables();
            tf.engine().endScope();
            return;
        }

        counter++;
        if (counter < 2000) {
            [att_location,att_context,gru0_hx,gru1_hx, gru2_hx, input] = tf.tidy(function() {
                // Attention
                const inp_0 = tf.concat([att_context, input], 1);
                gru0_hx_ = gru0_hx;
                [out_0,gru0_hx] = gru_core(inp_0, [gru0_w_h, gru0_w_i, gru0_bias], gru0_hx, RNN_SIZE);
                tf.dispose(gru0_hx_);
                const att_inp = tf.concat([att_context, input, out_0], 1);
                const att_params = tf.add(tf.matMul(att_inp, att_w), att_b);
                [alpha,beta,kappa] = tf.split(softplus(att_params), 3, 1);
                att_location_ = att_location;
                att_location = tf.add(att_location, tf.div(kappa, 25.));
                tf.dispose(att_location_)

                var phi = tf.sum(tf.mul(alpha, tf.exp(tf.div(tf.neg(tf.square(tf.sub(att_location, ruler))), beta))), 1);
                phi = tf.expandDims(phi, 0);
                
                att_context_ = att_context;
                att_context = tf.sum(tf.mul(tf.expandDims(phi, 2), tf.expandDims(embed, 0)), 1)
                tf.dispose(att_context_);

                const inp_1 = tf.concat([input, out_0, att_context], 1);
                // tf.dispose(input);
                gru1_hx_ = gru1_hx;
                [out_1,gru1_hx] = gru_core(inp_1, [gru1_w_h, gru1_w_i, gru1_bias], gru1_hx, RNN_SIZE);
                tf.dispose(gru1_hx_);

                const inp_2 = tf.concat([input, out_1, att_context], 1);
                tf.dispose(input);
                gru2_hx_ = gru2_hx;
                [out_2, gru2_hx] = gru_core(inp_2, [gru2_w_h, gru2_w_i, gru2_bias], gru2_hx, RNN_SIZE);
                tf.dispose(gru2_hx_);

                // debugger;

                // GMM
                const gmm_params = tf.add(tf.matMul(out_2, gmm_w), gmm_b);
                [x,y,logstdx,logstdy,angle,log_weight,eos_logit] = tf.split(gmm_params, [NUM_GMM_HEADS, NUM_GMM_HEADS, NUM_GMM_HEADS, NUM_GMM_HEADS, NUM_GMM_HEADS, NUM_GMM_HEADS, 1], 1);
                // log_weight = tf.softmax(log_weight, 1);
                // log_weight = tf.log(log_weight);
                // log_weight = tf.mul(log_weight, 1. + bias);
                const idx = tf.argMax(log_weight, 1).dataSync()[0];
                // const idx = tf.multinomial(log_weight, 1).dataSync()[0];
                x = x.dataSync()[idx];
                y = y.dataSync()[idx];
                const stdx = tf.exp(tf.sub(logstdx, bias)).dataSync()[idx];
                const stdy = tf.exp(tf.sub(logstdy, bias)).dataSync()[idx];
                angle = angle.dataSync()[idx];
                e = tf.sigmoid(tf.mul(eos_logit, (1. + bias/5))).dataSync()[0];
                const rx = rand_truncated_normal(-5, 5) * stdx;
                const ry = rand_truncated_normal(-5, 5) * stdy;
                x = x + Math.cos(-angle) * rx - Math.sin(-angle) * ry;
                y = y + Math.sin(-angle) * rx + Math.cos(-angle) * ry;
                if (Math.random() < e) {
                    e = 1.;
                } else {
                    e = 0.;
                }
                input = tf.tensor([[x, y, e]]);
                return [att_location, att_context, gru0_hx, gru1_hx, gru2_hx, input];
            });

            [dx,dy,eos_] = input.dataSync();
            dy = -dy * 3. * scale_factor;
            dx = dx * 3. * scale_factor;
            if (eos == 0.) {
                ctx.beginPath();
                ctx.moveTo(cur_x, cur_y, 0, 0);
                ctx.lineTo(cur_x + dx, cur_y + dy);
                ctx.stroke();
            }
            eos = eos_;
            cur_x = cur_x + dx;
            cur_y = cur_y + dy;

            if (att_location.dataSync()[0] < original_text.length + 1.5) {
                setTimeout(function() {loop(my_run_id);}, 0);
            }
        }
    }

    loop(run_id);
}


window.on = function(e) {
    scale_factor = window.innerWidth / 1600;
}

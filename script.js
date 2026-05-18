document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // Supabase 設定 (世界共有データベース)
    // ※ 以下のURLとANON_KEYをご自身のプロジェクトのものに書き換えてください。
    // ==========================================
    const SUPABASE_URL = 'https://xiedohcvelkjodxsliyu.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_81Of8HJAL40mqYmSO-Qo3Q_zmW3tDaa';

    let supabase = null;
    if (SUPABASE_URL !== 'YOUR_SUPABASE_URL' && window.supabase) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
        console.warn('SupabaseのURLとKEYが設定されていないため、データベース機能はオフラインモードで動作します。');
    }

    const talkBtn = document.getElementById('talk-btn');
    const speechBubble = document.getElementById('speech-bubble');
    const speechText = document.getElementById('speech-text');
    const questionMark = document.getElementById('question-mark');
    const parrotElement = document.getElementById('parrot');
    const foodContainer = document.getElementById('food-container');
    const parrotContainer = document.getElementById('parrot-container');

    // ==========================================
    // ヘルプパネルの開閉
    // ==========================================
    const helpBtn = document.getElementById('help-btn');
    const helpPanel = document.getElementById('help-panel');
    const helpCloseBtn = document.getElementById('help-close-btn');

    if (helpBtn && helpPanel) {
        helpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            helpPanel.classList.toggle('hidden');
        });
    }
    if (helpCloseBtn) {
        helpCloseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            helpPanel.classList.add('hidden');
        });
    }
    // パネル外クリックで閉じる
    document.addEventListener('click', (e) => {
        if (helpPanel && !helpPanel.classList.contains('hidden')) {
            if (!e.target.closest('#help-widget')) {
                helpPanel.classList.add('hidden');
            }
        }
    });

    // 単語帳UIと背景アーカイブUIの要素
    const dictToggleBtn = document.getElementById('dict-toggle-btn');
    const dictPanel = document.getElementById('dict-panel');
    const dictList = document.getElementById('dict-list');
    
    const bgToggleBtn = document.getElementById('bg-toggle-btn');
    const bgPanel = document.getElementById('bg-panel');
    const bgList = document.getElementById('bg-list');

    // 記憶用の辞書オブジェクト { "言葉": 回数 }
    let memory = {};

    // インコの状態管理
    const parrotState = {
        x: parrotContainer.clientWidth / 2,
        y: parrotContainer.clientHeight / 2,
        speed: 1.5,
        state: 'idle',
        target: null,
        clickTarget: null,
        lastIdleTime: Date.now()
    };

    let foods = [];
    let foodIdCounter = 0;

    // 背景アイテム関連
    let backgroundMemory = ['はじまりの野原']; // 初期値を設定
    let bgSpawnCount = 0; // すでに出現させた背景餌の数（5個ごとに+1）

    // カタカナをひらがなに変換する簡易関数
    function toHiragana(str) {
        return str.replace(/[\u30a1-\u30f6]/g, function (match) {
            var chr = match.charCodeAt(0) - 0x60;
            return String.fromCharCode(chr);
        });
    }

    // 文字数に応じて覚えるために必要な回数を計算する関数
    function getRequiredTimes(len) {
        if (len <= 5) return 5;
        if (len < 10) return 6;
        return 7;
    }

    // Web Speech API の初期化
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;
    let isContinuous = false; // 常時認識フラグ
    let isSpeaking = false;   // インコ発声中フラグ

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.lang = 'ja-JP';
        recognition.interimResults = true; // 認識途中の結果も取得
        recognition.continuous = true; // 常時認識をONにする
    } else {
        alert("お使いのブラウザは音声認識に対応していません。Google Chromeをご利用ください。");
        talkBtn.disabled = true;
    }

    // 聞き間違い用の変換マップ
    const mistakeMap = {
        'あ': 'ぁ', 'い': 'ぃ', 'う': 'ぅ', 'え': 'ぇ', 'お': 'ぉ',
        'か': 'が', 'き': 'ぎ', 'く': 'ぐ', 'け': 'げ', 'こ': 'ご',
        'さ': 'ざ', 'し': 'じ', 'す': 'ず', 'せ': 'ぜ', 'そ': 'ぞ',
        'た': 'だ', 'ち': 'ぢ', 'つ': 'っ', 'て': 'で', 'と': 'ど',
        'は': 'ば', 'ひ': 'び', 'ふ': 'ぶ', 'へ': 'べ', 'ほ': 'ぼ',
        'や': 'ゃ', 'ゆ': 'ゅ', 'よ': 'ょ', 'わ': 'ゎ'
    };

    // 聞き間違いを発生させる関数（指定した文字数だけ間違える）
    function applyMistake(text, numMistakes) {
        if (text.length === 0) return text;
        const chars = text.split('');

        for (let i = 0; i < numMistakes; i++) {
            const targetIndex = Math.floor(Math.random() * chars.length);
            const char = chars[targetIndex];
            if (mistakeMap[char]) {
                chars[targetIndex] = mistakeMap[char];
            } else {
                // マップにない文字（漢字など）なら、インコっぽい音やごまかしに強制変換
                const birdSounds = ['ピ', 'ぴょ', 'ァ', '…', '？', '〜'];
                chars[targetIndex] = birdSounds[Math.floor(Math.random() * birdSounds.length)];
            }
        }
        return chars.join('');
    }

    // リストの描画更新
    function renderMemory() {
        // 1. 背景アーカイブUIの更新
        if (bgList) {
            bgList.innerHTML = ''; 
            
            if (backgroundMemory.length === 0) {
                bgList.innerHTML = '<li class="empty-msg">まだ背景がないよ...</li>';
            } else {
                backgroundMemory.forEach(bg => {
                    const li = document.createElement('li');
                    li.textContent = bg;
                    li.addEventListener('click', () => {
                        changeBackground(bg);
                    });
                    bgList.appendChild(li);
                });
            }
        }

        // 2. 右上の単語帳UI（覚えた言葉のみ）
        if (dictList) {
            dictList.innerHTML = '';
            const learnedWords = Object.keys(memory).filter(word => {
                const requiredTimes = getRequiredTimes(word.length);
                return memory[word] >= requiredTimes;
            });

            if (learnedWords.length === 0) {
                dictList.innerHTML = '<li class="empty-msg">まだ言葉を覚えていないよ...</li>';
            } else {
                learnedWords.forEach(word => {
                    const li = document.createElement('li');
                    li.textContent = word;
                    dictList.appendChild(li);
                });
            }
        }
    }

    // UIパネルの開閉
    if (dictToggleBtn) {
        dictToggleBtn.addEventListener('click', () => {
            dictPanel.classList.toggle('hidden');
        });
    }
    if (bgToggleBtn) {
        bgToggleBtn.addEventListener('click', () => {
            bgPanel.classList.toggle('hidden');
        });
    }

    if (recognition) {
        // 認識スタート時
        recognition.onstart = () => {
            // 聞いている最中の表示はしない
        };

        // 認識中
        recognition.onresult = (event) => {
            // インコが喋っている最中は自分の声を拾わないように結果を無視する
            if (isSpeaking) return;

            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            // 最終結果が確定した場合
            if (finalTranscript !== '') {
                // カタカナをひらがなに変換
                finalTranscript = toHiragana(finalTranscript);

                // 記憶リストの更新（ユーザーが言った正しい言葉をカウント）
                if (memory[finalTranscript]) {
                    memory[finalTranscript]++;
                } else {
                    memory[finalTranscript] = 1;
                }
                const timesHeard = memory[finalTranscript];
                renderMemory();

                // 覚えるために必要な回数（最低8回。文字数が多いほど増える）
                const requiredTimes = getRequiredTimes(finalTranscript.length);

                // 学習条件（ルート1）: 必要回数に達した瞬間に餌を出現させる
                if (timesHeard === requiredTimes) {
                    spawnFood(finalTranscript);

                    // Supabaseに言葉を保存・更新
                    saveWordToDB(finalTranscript);

                    // 背景の餌の出現チェック（完璧に覚えた言葉の数が5の倍数になった瞬間）
                    const learnedCount = Object.keys(memory).filter(w => memory[w] >= getRequiredTimes(w.length)).length;
                    if (learnedCount > 0 && learnedCount % 5 === 0 && bgSpawnCount < Math.floor(learnedCount / 5)) {
                        bgSpawnCount++;
                        spawnBackgroundFood();
                    }
                }

                // 回数に応じて聞き間違いの度合いを変える
                let spokenText = finalTranscript;
                if (timesHeard < requiredTimes) {
                    // まだ完璧に覚えていない場合
                    // 進捗 (0.0 〜 1.0 に近づく) に応じて間違いの割合を減らす
                    const progress = timesHeard / requiredTimes;
                    const mistakeRatio = 1.0 - progress; // 初期はほぼ1.0、最後は小さい値

                    // 間違える文字数（最低でも1文字は必ず間違える）
                    const mistakeCount = Math.max(1, Math.ceil(finalTranscript.length * mistakeRatio));
                    spokenText = applyMistake(finalTranscript, mistakeCount);
                }

                speechText.textContent = spokenText;
                speechBubble.classList.remove('hidden'); // インコが喋る時のみ表示

                // まだ覚えていない場合は「？」を浮かべる
                if (timesHeard < requiredTimes) {
                    questionMark.classList.remove('hidden');
                    // アニメーションが終わったら隠す
                    setTimeout(() => {
                        questionMark.classList.add('hidden');
                    }, 1500);
                }

                // インコが喋る（インコが認識したつもりの言葉）
                speakParrot(spokenText);
            }
        };

        // 認識終了時
        recognition.onend = () => {
            // 常時認識モードなら、喋っている最中でも必ず再スタートする
            if (isContinuous) {
                try { recognition.start(); } catch (e) { }
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            if (event.error !== 'no-speech' && event.error !== 'aborted') {
                isContinuous = false;
                talkBtn.innerHTML = '<span class="icon">🎙️</span> おしゃべりする';
                talkBtn.classList.remove('pulse');
            }
            speechBubble.classList.add('hidden');
        };
    }

    // インコが喋る機能
    function speakParrot(text) {
        if (!window.speechSynthesis) return;

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ja-JP';
        utterance.volume = 1.0; // 音量を最大に

        // イントネーションのバリエーション
        let basePitch = 2.0;
        let baseRate = 1.3;

        // 語尾が「？」や「?」の場合はピッチを高くする（疑問形イントネーションの模倣）
        if (text.endsWith('？') || text.endsWith('?')) {
            basePitch = 2.3;
            baseRate = 1.1; // 少しゆっくりに
        } else {
            // それ以外は毎回少しピッチを揺らがせて、イントネーションの違いを表現
            basePitch = 1.8 + (Math.random() * 0.4); // 1.8 〜 2.2
            baseRate = 1.2 + (Math.random() * 0.2);  // 1.2 〜 1.4
        }

        utterance.pitch = basePitch;
        utterance.rate = baseRate;

        // しゃべり始め
        utterance.onstart = () => {
            isSpeaking = true;
            parrotElement.className = 'parrot-sprite talking';
        };

        // しゃべり終わり
        utterance.onend = () => {
            isSpeaking = false;
            parrotElement.className = 'parrot-sprite facing-front';
            parrotState.state = 'idle';
            parrotState.lastIdleTime = Date.now();
            setTimeout(() => {
                speechBubble.classList.add('hidden');
            }, 1000); // 1秒後に吹き出しを消す
        };

        window.speechSynthesis.speak(utterance);
    }

    // ルート2: ランダム自動生成（15〜30秒間隔）
    function scheduleRandomFood() {
        const delay = 15000 + Math.random() * 15000;
        setTimeout(() => {
            const learnedWords = Object.keys(memory).filter(word => {
                const requiredTimes = getRequiredTimes(word.length);
                return memory[word] >= requiredTimes;
            });
            if (learnedWords.length > 0) {
                const randomWord = learnedWords[Math.floor(Math.random() * learnedWords.length)];
                spawnFood(randomWord);
            }
            scheduleRandomFood(); // ループ
        }, delay);
    }
    scheduleRandomFood();

    // 餌の生成関数
    function spawnFood(text) {
        const id = foodIdCounter++;
        const padding = 30;
        const w = parrotContainer.clientWidth;
        const h = parrotContainer.clientHeight;
        const x = padding + Math.random() * (w - padding * 2);
        const y = padding + Math.random() * (h - padding * 2);

        const el = document.createElement('div');
        el.className = 'food-text';
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.textContent = text;

        foodContainer.appendChild(el);
        foods.push({ id, x, y, text, isBackground: false, element: el });
    }

    // 背景変更用の特殊な餌
    function spawnBackgroundFood() {
        const id = foodIdCounter++;
        const padding = 40;
        const w = parrotContainer.clientWidth;
        const h = parrotContainer.clientHeight;
        const x = padding + Math.random() * (w - padding * 2);
        const y = padding + Math.random() * (h - padding * 2);

        const el = document.createElement('div');
        el.className = 'food-bg';
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.textContent = '🌟背景のタネ🌟';

        foodContainer.appendChild(el);
        foods.push({ id, x, y, text: '🌟背景のタネ🌟', isBackground: true, element: el });
    }

    // 背景の変更処理
    function changeBackgroundBasedOnMemory() {
        const learnedWords = Object.keys(memory).filter(w => memory[w] >= getRequiredTimes(w.length));
        const allText = learnedWords.join('');

        const bgTypes = [
            { name: '炎の野原', file: 'assets/bg_fire.png', keys: ['あつ', 'ほのお', 'かじ', 'もえ', 'ひ'] },
            { name: '水の野原', file: 'assets/bg_water.png', keys: ['みず', 'うみ', 'つめた', 'あめ', 'かわ'] },
            { name: '闇の野原', file: 'assets/bg_dark.png', keys: ['やみ', 'よる', 'くらい', 'うちゅう', 'ほし'] },
            { name: '魔法の野原', file: 'assets/bg_magic.png', keys: ['まほう', 'きらきら', 'ゆめ', 'ひかり', 'ピンク', 'かわいい'] }
        ];

        let chosenBg = null;
        for (let bg of bgTypes) {
            for (let key of bg.keys) {
                if (allText.includes(key)) {
                    chosenBg = bg;
                    break;
                }
            }
            if (chosenBg) break;
        }

        // キーワードに合致しなければランダム
        if (!chosenBg) {
            chosenBg = bgTypes[Math.floor(Math.random() * bgTypes.length)];
        }

        document.body.style.backgroundImage = `url('${chosenBg.file}')`;

        if (!backgroundMemory.includes(chosenBg.name)) {
            backgroundMemory.push(chosenBg.name);
        }
        renderMemory(); // リストの更新
    }

    // インコの移動とAIアップデート
    function updateParrot() {
        // ターゲットの設定
        if (foods.length > 0) {
            let closest = null;
            let minDist = Infinity;
            for (let f of foods) {
                let dx = f.x - parrotState.x;
                let dy = f.y - parrotState.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < minDist) {
                    minDist = dist;
                    closest = f;
                }
            }
            parrotState.target = { x: closest.x, y: closest.y, food: closest };
            parrotState.state = 'walking';
            parrotState.clickTarget = null;
        } else if (parrotState.clickTarget) {
            parrotState.target = { x: parrotState.clickTarget.x, y: parrotState.clickTarget.y, food: null, isClick: true };
            parrotState.state = 'walking';
        } else {
            // お散歩モード
            if (!parrotState.target) {
                if (Date.now() - parrotState.lastIdleTime > 3000 + Math.random() * 4000) {
                    const padding = 40;
                    parrotState.target = {
                        x: padding + Math.random() * (parrotContainer.clientWidth - padding * 2),
                        y: padding + Math.random() * (parrotContainer.clientHeight - padding * 2),
                        food: null
                    };
                    parrotState.state = 'walking';
                }
            }
        }

        // 移動処理
        if (parrotState.target && parrotState.state === 'walking') {
            let dx = parrotState.target.x - parrotState.x;
            let dy = parrotState.target.y - parrotState.y;
            let dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 5) {
                if (parrotState.target.food) {
                    eatFood(parrotState.target.food);
                } else if (parrotState.target.isClick) {
                    parrotState.state = 'idle';
                    parrotState.target = null;
                    parrotState.clickTarget = null;
                    parrotState.lastIdleTime = Date.now();
                    if (!isSpeaking) parrotElement.className = 'parrot-sprite facing-front';
                    questionMark.classList.remove('hidden');
                    setTimeout(() => { questionMark.classList.add('hidden'); }, 1000);
                } else {
                    parrotState.state = 'idle';
                    parrotState.target = null;
                    parrotState.lastIdleTime = Date.now();
                    if (!isSpeaking) parrotElement.className = 'parrot-sprite facing-front';
                }
            } else {
                parrotState.x += (dx / dist) * parrotState.speed;
                parrotState.y += (dy / dist) * parrotState.speed;

                if (isSpeaking) {
                    // 歩きながら喋る場合
                    parrotElement.className = dx < 0 ? 'parrot-sprite facing-left talking walking' : 'parrot-sprite facing-right talking walking';
                } else {
                    parrotElement.className = dx < 0 ? 'parrot-sprite facing-left walking' : 'parrot-sprite facing-right walking';
                }
            }
        } else {
            // 止まっている場合
            if (isSpeaking) {
                parrotElement.className = 'parrot-sprite talking';
            } else if (parrotState.state === 'idle') {
                parrotElement.className = 'parrot-sprite facing-front';
            }
        }

        // DOMの座標更新
        parrotElement.style.left = `${parrotState.x}px`;
        parrotElement.style.top = `${parrotState.y}px`;

        // 吹き出しをインコの頭上に追従させる
        if (!speechBubble.classList.contains('hidden')) {
            speechBubble.style.left = `${parrotState.x}px`;
            speechBubble.style.top = `${parrotState.y - 250}px`;
        }
        if (!questionMark.classList.contains('hidden')) {
            questionMark.style.left = `${parrotState.x + 80}px`;
            questionMark.style.top = `${parrotState.y - 250}px`;
        }
    }

    // クリックイベント全般
    document.addEventListener('click', (e) => {
        // インコをクリックした場合：覚えた言葉をランダムに発声
        if (e.target.closest('#parrot')) {
            const learnedWords = Object.keys(memory).filter(word => memory[word] >= getRequiredTimes(word.length));
            let speech = '';
            if (learnedWords.length > 0) {
                speech = learnedWords[Math.floor(Math.random() * learnedWords.length)];
            } else {
                const sounds = ['ピヨッ！', 'クワッ！', 'ピピピピ', 'クルックー', 'ギャッ！'];
                speech = sounds[Math.floor(Math.random() * sounds.length)];
            }
            
            speechText.textContent = speech;
            speechBubble.classList.remove('hidden');
            speakParrot(speech);
            return;
        }

        if (e.target.closest('#talk-btn') || e.target.closest('.food-text') || e.target.closest('.food-bg') || e.target.closest('.top-right-ui') || e.target.closest('.top-left-ui')) {
            return;
        }

        const rect = parrotContainer.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        createGrassEffect(clickX, clickY);

        if (foods.length === 0) {
            parrotState.clickTarget = { x: clickX, y: clickY };
            parrotState.state = 'walking';
        }
    });

    function createGrassEffect(x, y) {
        const container = document.createElement('div');
        container.className = 'grass-effect-container';
        container.style.left = `${x}px`;
        container.style.top = `${y}px`;

        const leafCount = 3 + Math.floor(Math.random() * 2);
        for (let i = 0; i < leafCount; i++) {
            const leaf = document.createElement('div');
            leaf.className = 'grass-leaf';

            const angle = Math.random() * Math.PI * 2;
            const distance = 15 + Math.random() * 20;
            const dx = Math.cos(angle) * distance;
            const dy = Math.sin(angle) * distance;
            const rot = (Math.random() - 0.5) * 360;

            leaf.style.setProperty('--dx', `${dx}px`);
            leaf.style.setProperty('--dy', `${dy}px`);
            leaf.style.setProperty('--rot', `${rot}deg`);

            container.appendChild(leaf);
        }

        foodContainer.appendChild(container);
        setTimeout(() => {
            if (container.parentNode) {
                container.parentNode.removeChild(container);
            }
        }, 600);
    }

    function eatFood(food) {
        foods = foods.filter(f => f.id !== food.id);
        if (food.element.parentNode) {
            food.element.parentNode.removeChild(food.element);
        }

        parrotState.state = 'talking';
        parrotState.target = null;

        if (food.isBackground) {
            changeBackgroundBasedOnMemory();
            speechText.textContent = '背景がかわったよ！';
            speechBubble.classList.remove('hidden');
            speakParrot('背景がかわったよ！');
        } else {
            speechText.textContent = food.text;
            speechBubble.classList.remove('hidden');
            speakParrot(food.text);
        }
    }

    // ゲームループ開始
    function gameLoop() {
        updateParrot();
        requestAnimationFrame(gameLoop);
    }
    requestAnimationFrame(gameLoop);

    // ボタンクリックで常時認識モードのON/OFF
    talkBtn.addEventListener('click', () => {
        if (!isContinuous) {
            isContinuous = true;
            talkBtn.innerHTML = '<span class="icon">🎙️</span> 話しかけてね...';
            talkBtn.classList.add('pulse');
            try {
                recognition.start();
            } catch (e) {
                console.error(e);
            }
        } else {
            isContinuous = false;
            talkBtn.innerHTML = '<span class="icon">🎙️</span> おしゃべりする';
            talkBtn.classList.remove('pulse');
            try {
                recognition.stop();
            } catch (e) { }
        }
    });
    // ==========================================
    // Supabase 連携関数群
    // ==========================================

    async function saveWordToDB(word) {
        if (!supabase) return;
        try {
            const { data, error } = await supabase
                .from('parrot_memories')
                .select('count')
                .eq('word', word)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error('Supabase select error:', error);
            }

            if (data) {
                await supabase
                    .from('parrot_memories')
                    .update({ count: data.count + 1 })
                    .eq('word', word);
            } else {
                await supabase
                    .from('parrot_memories')
                    .insert([{ word: word, count: 1 }]);
            }
        } catch (err) {
            console.error('Supabase save error:', err);
        }
    }

    async function loadInitialWords() {
        if (!supabase) return;
        try {
            const { data, error } = await supabase
                .from('parrot_memories')
                .select('word, count')
                .order('count', { ascending: false })
                .limit(20);

            if (error) throw error;
            if (data && data.length > 0) {
                const numToSpawn = Math.min(data.length, 3 + Math.floor(Math.random() * 3));
                const shuffled = data.sort(() => 0.5 - Math.random());
                for (let i = 0; i < numToSpawn; i++) {
                    setTimeout(() => {
                        spawnFood(shuffled[i].word);
                    }, i * 2000);
                }
            }
        } catch (err) {
            console.error('Supabase load error:', err);
        }
    }

    function setupRealtimeSubscription() {
        if (!supabase) return;

        supabase
            .channel('public:parrot_memories')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'parrot_memories' }, payload => {
                if (payload.new && payload.new.word) {
                    const newWord = payload.new.word;
                    const isAlreadySpawned = foods.some(f => f.text === newWord);
                    if (!isAlreadySpawned) {
                        spawnFood(newWord);
                    }
                }
            })
            .subscribe();
    }

    // 初期化実行
    if (supabase) {
        loadInitialWords();
        setupRealtimeSubscription();
    }
});

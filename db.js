const fs = require('fs');
const path = require('path');

// Caminho absoluto para o banco de dados JSON armazenado dentro da pasta data
const dbPath = path.join(__dirname, 'data', 'db.json');

/**
 * Estrutura base do banco de dados (Fallback)
 * @property {Object} pendencias - Controla lembretes enviados que ainda não foram respondidos (esperando OK, adiar, etc).
 * @property {Object} agendamentosMestres - Armazena agendamentos adiados por longos períodos (ex: 7 dias), anulando os diários.
 * @property {Array} lembretesPontuais - Armazena tarefas para serem executadas num horário customizado no futuro próximo (sonecas em minutos, lembretes pra noite).
 */
const defaultData = {
    pendencias: {},
    agendamentosMestres: {},
    lembretesPontuais: []
};

/**
 * Inicia o "banco de dados" local via FileSystem.
 * Cria o diretório "data" e o arquivo "db.json" se eles não existirem no sistema.
 */
function initDB() {
    const dir = path.join(__dirname, 'data');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log('📂 [DB] Diretório de dados criado com sucesso.');
    }
    if (!fs.existsSync(dbPath)) {
        fs.writeFileSync(dbPath, JSON.stringify(defaultData, null, 4));
        console.log('📄 [DB] Arquivo base db.json criado com sucesso.');
    }
}

/**
 * Lê e decodifica o banco de dados armazenado em disco.
 * Em caso de corrupção ou erro físico de leitura, recria os defaults para não travar o robô.
 * @returns {Object} JSON atual do sistema.
 */
function readDB() {
    try {
        const data = fs.readFileSync(dbPath, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error('❌ [DB] Erro agudo ao ler db.json, reinicializando em memória...', e);
        return { ...defaultData };
    }
}

/**
 * Serializa a variável modificada em texto e escreve sincronicamente de volta no disco (Salva Alterações).
 * @param {Object} data - O objeto com os dados atualizados das respostas e lembretes.
 */
function writeDB(data) {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 4));
    } catch (e) {
        console.error('❌ [DB] Erro físico ao tentar salvar alterações no db.json:', e);
    }
}

// Garante que o banco seja montado ao importar o arquivo.
initDB();

module.exports = {
    readDB,
    writeDB
};

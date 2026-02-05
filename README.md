# 🤖 Robozildo - Sistema de Lembretes de Remédio via WhatsApp

Sistema inteligente que envia lembretes de remédios no WhatsApp com opções flexíveis de adiamento e confirmação.

## ✨ Funcionalidades

- 📅 **Múltiplos remédios por horário** - Cada horário pode ter seu próprio remédio
- ⏰ **Adiamento personalizado** - Diga exatamente quantos minutos quer adiar
- 🌙 **Opção de tomar à noite** - Adia automaticamente para as 19h
- 💬 **Interface amigável** - Respostas inteligentes com emojis
- 🔄 **Follow-up automático** - Lembra novamente se não responder em 15 minutos
- 🐳 **Container Docker** - Deploy fácil em qualquer servidor

## 🚀 Como Funciona

1. O sistema envia mensagens automáticas nos horários configurados
2. Pergunta se você já tomou o remédio específico
3. Oferece 3 opções: Sim, Adiar (minutos personalizados) ou Tomar à noite
4. Registra sua resposta e agenda o próximo lembrete se necessário
5. Envia um lembrete de follow-up se você não responder em 15 minutos

## 📋 Pré-requisitos

- Node.js 22+ (ou Docker para deploy)
- WhatsApp instalado no celular
- Conexão com internet

## 🐳 Deploy com Docker (Recomendado)

### 1. Build e Execução
```bash
# Clone o repositório
git clone https://github.com/GuilhermeD9/wpp-reminder.git
cd wpp-reminder

# Configure seu número no index.js antes de buildar
nano index.js

# Build da imagem
docker build -t wpp-reminder .

# Criar volumes para persistência
mkdir -p data cache

# Executar container
docker run -d \
  --name wpp-reminder \
  --restart unless-stopped \
  -v $(pwd)/data:/app/.wwebjs_auth \
  -v $(pwd)/cache:/app/.wwebjs_cache \
  wpp-reminder

# Ou com docker-compose
docker-compose up
```

### 2. Configuração
Configure no arquivo `index.js` ou use variáveis de ambiente:

**Opção 1: Editar o código**
```javascript
const CONFIG = {
    NUMERO_ALVO: '(preencha)', // FORMATO(55 + DDD + NÚMERO)
    REMEDIOS_POR_HORARIO: {
        '12:00': 'Anticoncepcional',
        '12:30': 'Rocutan',
        '14:30': 'Rocutan'
    }
};
```

**Opção 2: Variáveis de ambiente (.env)**
Crie um arquivo `.env`:
```bash
NUMERO_ALVO= '0000000900'
```

**Opção 3: Docker com variáveis**
```bash
docker run -d \
  --name wpp-reminder \
  -e NUMERO_ALVO="(preencha)" \
  --restart unless-stopped \
  -v $(pwd)/data:/app/.wwebjs_auth \
  -v $(pwd)/cache:/app/.wwebjs_cache \
  wpp-reminder
```

### 3. Variáveis de Ambiente (Opcional)
Você pode usar variáveis de ambiente em vez de editar o código:
```bash
# Com variáveis de ambiente
docker run -d \
  --name wpp-reminder \
  -e SEU_NUMERO="(preencha)" \
  -e REMEDIOS='{"12:00":"Anticoncepcional","12:30":"Rocutan","14:30":"Rocutan"}' \
  --restart unless-stopped \
  -v $(pwd)/data:/app/.wwebjs_auth \
  -v $(pwd)/cache:/app/.wwebjs_cache \
  wpp-reminder
```

## 🔧 Instalação Local

### 1. Dependências
```bash
npm install
```

### 2. Configuração
Edite o arquivo `index.js` e ajuste:
- `SEU_NUMERO`: Seu número completo com código do país
- `REMEDIOS_POR_HORARIO`: Horários e remédios correspondentes

**Formato do número:**
- Código do país (55 para Brasil) + DDD + número
- Sem espaços, parênteses ou hífens
- Exemplo: `550011111111`

### 3. Execução
```bash
npm start
```

## 📱 Como Usar

### Conexão Inicial
1. Execute o programa
2. Um QR Code aparecerá no terminal
3. Abra o WhatsApp > Configurações > Aparelhos conectados
4. Escaneie o QR Code

### Respostas Possíveis
Quando receber um lembrete, você pode responder:

**1️⃣ Sim**
- `sim`, `s`, `tomei`, `ja tomei`, `1`

**2️⃣ Adiar**
- `adiar`, `espera`, `depois`, `2`
- Depois digite os minutos: `30`, `60`, `120`...

**3️⃣ Tomar à noite**
- `vou tomar pela noite`, `noite`, `3`
- Agenda automaticamente para as 19h do mesmo dia

### Exemplo de Conversa
```
🤖 💊 Hora do Anticoncepcional
   🔍 Já tomou?

   📝 Responda:
   1️⃣ Sim
   2️⃣ Adiar (diga os minutos)
   3️⃣ Tomar à noite

👤 2

🤖 ⏰ Por quantos minutos quer adiar?
   💡 Ex: 30, 60, 120...

👤 45

🤖 ✅ Ok! Te lembro em 45 minutos.
```

## 📝 Personalização

### Adicionar Novos Horários
```javascript
REMEDIOS_POR_HORARIO: {
    '08:00': 'Vitamina C',
    '12:00': 'Anticoncepcional',
    '14:00': 'Rocutan',
    '18:00': 'Vitamina D',
    '20:00': 'Magnésio'
}
```

### Formato dos Horários
- Use formato 24h: `'HH:MM'`
- Exemplo: `'09:30'`, `'14:15'`, `'22:00'`

## ⚠️ Importante

- Mantenha o programa/container rodando para receber os lembretes
- O WhatsApp precisa estar conectado à internet
- Sessão do WhatsApp é salva automaticamente
- Se o container reiniciar, a sessão é mantida pelos volumes

## 🐛 Solução de Problemas

**QR Code não aparece:**
- Verifique se o Node.js/Docker está instalado corretamente
- Reinicie o container: `docker-compose restart`

**Não recebe mensagens:**
- Verifique se o número está no formato correto
- Confirme que escaneou o QR Code corretamente
- Verifique os logs: `docker-compose logs -f`

**Erro de permissão:**
- Verifique as permissões dos diretórios data/cache
- Use `chmod 755 data cache` se necessário

**Container cai:**
- Use restart automático: `--restart unless-stopped`
- Verifique logs de erro: `docker logs wpp-reminder`

## 📄 Estrutura do Projeto

```
wpp-reminder/
├── index.js              # Código principal
├── package.json           # Dependências
├── Dockerfile            # Imagem Docker
├── docker-compose.yml    # Orquestração
├── .dockerignore         # Exclusões do build
├── .gitignore           # Exclusões do git
├── data/               # Sessão WhatsApp (volume)
└── cache/              # Cache WhatsApp (volume)
```

## 🔄 Atualizações

O sistema verifica os horários a cada 30 segundos, garantindo que nenhum lembrete seja perdido. Respostas são processadas instantaneamente.

## 📄 Licença

MIT License - Sinta-se livre para usar e modificar!

---

**🤖 Robozildo - Seu assistente pessoal de saúde!**
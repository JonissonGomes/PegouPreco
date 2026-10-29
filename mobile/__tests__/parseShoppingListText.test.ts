import {parseShoppingListText} from '../src/domain/parseShoppingListText';

const SAMPLE = `Arroz
Grão de bico
Farinha de trigo
2 Macarrões 
3 molhos de tomate 
3 cremes de leite 
3 leite em pó 
6 leites em cx
1 doce de leite
1 leite condensado 
2 pipocas
Chá (erva-doce, camomila, hortelã)
Aveia

4 peitos de frango
1 de sobrecoxa
1 costelinha de porco
1 de fígado bovino
1 carne
(Se der um peixe, piramitunga)

Linguiça calabresa 
Queijo
Mortadela
Charque
Masa de pastel
Massa de pastel
5 Sachê de gato

Shampoo condicionador
Creme pentear 
4 sabonetes
Desodorante bruna e jon
Papel higiênico 
Líquido de louça
Esponja
Pastilha sanitária
Veja
Desinfetante 
Papel toalha`;

describe('parseShoppingListText', () => {
  it('lê quantidades e expande parênteses', () => {
    const items = parseShoppingListText(SAMPLE);
    const byName = (name: string) =>
      items.find(item => item.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'));

    expect(byName('Arroz')?.quantity).toBe(1);
    expect(byName('Macarrões')?.quantity).toBe(2);
    expect(byName('molhos de tomate')?.quantity).toBe(3);
    expect(byName('leites em cx')?.quantity).toBe(6);
    expect(byName('Sachê de gato')?.quantity).toBe(5);
    expect(byName('Chá erva-doce')).toBeTruthy();
    expect(byName('Chá camomila')).toBeTruthy();
    expect(byName('Chá hortelã')).toBeTruthy();
    expect(byName('peixe')).toBeTruthy();
    expect(byName('piramitunga')).toBeTruthy();
    expect(items.length).toBeGreaterThan(30);
  });

  it('classifica itens principais', () => {
    const items = parseShoppingListText(SAMPLE);
    const cat = (name: string) =>
      items.find(item => item.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))
        ?.category;
    expect(cat('Arroz')).toBe('Grãos');
    expect(cat('peitos de frango')).toBe('Açougue');
    expect(cat('Queijo')).toBe('Frios');
    expect(cat('Papel toalha')).toBe('Descartáveis');
  });
});

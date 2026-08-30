/** Kategoriebaum des Shops. Slugs sind zugleich die URL-Pfade. */
export interface CategorySeed {
  slug: string
  name: string
  teaser: string
  description: string
  icon: string
  sortOrder: number
  metaTitle: string
  metaDescription: string
  children?: CategorySeed[]
}

export const CATEGORIES: CategorySeed[] = [
  {
    slug: 'raeucherhaken',
    name: 'Räucherhaken',
    icon: 'hook',
    sortOrder: 10,
    teaser: 'Sechs Grundmodelle in V2A und V4A – vom feinen Fischhaken bis zur Aufhängeschiene.',
    description:
      'Räucherhaken tragen das Räuchergut über Stunden bei Hitze, Feuchtigkeit und Salz. Entscheidend sind Werkstoff, Drahtstärke und die Form der Spitze. Bei jedem Modell finden Sie Länge, Drahtstärke, Belastbarkeit und Einsatzgebiet in den technischen Daten – damit Sie vergleichen können, statt raten zu müssen.',
    metaTitle: 'Räucherhaken aus Edelstahl – V2A und V4A',
    metaDescription:
      'Räucherhaken in sechs Bauformen aus V2A und V4A. Länge, Drahtstärke und Belastbarkeit bei jedem Modell ausgewiesen. Auch als Sonderanfertigung nach Maß.',
  },
  {
    slug: 'fleischerhaken',
    name: 'Fleischerhaken',
    icon: 'beef',
    sortOrder: 20,
    teaser: 'Schwere Haken für Fleischerei, Wildkammer und Rohrbahn.',
    description:
      'Fleischerhaken sind stärker dimensioniert als Räucherhaken und für dauerhafte Lasten im gewerblichen Betrieb ausgelegt. Drahtstärke und Belastbarkeit stehen bei jedem Artikel; die Angaben beziehen sich auf ruhende Last bei bestimmungsgemäßem Gebrauch.',
    metaTitle: 'Fleischerhaken aus Edelstahl für Fleischerei und Wildkammer',
    metaDescription:
      'Fleischerhaken, Rohrhaken und Wildhaken aus V2A und V4A. Drahtstärke, Länge und Belastbarkeit je Artikel ausgewiesen.',
  },
  {
    slug: 'raeuchermehl',
    name: 'Räuchermehl',
    icon: 'flame',
    sortOrder: 30,
    teaser: 'Buche, Erle, Eiche, Kirsche und Wacholder – je nach gewünschtem Rauchbild.',
    description:
      'Die Holzart bestimmt Farbe und Aroma des Rauchs stärker als jede andere Stellschraube. Buche liefert das klassische, kräftige Bild, Erle arbeitet milder und wird traditionell bei Fisch eingesetzt, Kirsche bringt eine süßliche Note. Alle Mehle sind für Kalt- und Warmrauch geeignet, sofern nicht anders angegeben.',
    metaTitle: 'Räuchermehl und Räucherspäne – Buche, Erle, Eiche, Kirsche',
    metaDescription:
      'Räuchermehl in Räucherqualität: Buche, Erle, Eiche, Kirsche und Wacholder. Körnung und Rauchcharakter je Artikel beschrieben.',
  },
  {
    slug: 'raeucherlaugen',
    name: 'Räucherlaugen',
    icon: 'droplets',
    sortOrder: 40,
    teaser: 'Fertige Gewürzmischungen zum Ansetzen der Lake – für Fisch, Fleisch und Wurst.',
    description:
      'Eine Räucherlauge ist eine Gewürzmischung, die mit Wasser und Salz zur Lake angesetzt wird. Sie würzt, festigt das Eiweiß und bereitet das Räuchergut auf den Rauch vor. Bei jeder Mischung finden Sie eine Empfehlung zu Dosierung und Einlegedauer – als Ausgangspunkt, den Sie an Ihr Räuchergut anpassen.',
    metaTitle: 'Räucherlaugen und Pökellaugen für Fisch, Fleisch und Wurst',
    metaDescription:
      'Fertige Räucherlaugen zum Ansetzen der Lake. Für Forelle, Lachs, Makrele, Aal, Schinken und Wurst – mit Empfehlung zu Dosierung und Einlegedauer.',
  },
  {
    slug: 'naturgewuerze',
    name: 'Naturgewürze',
    icon: 'leaf',
    sortOrder: 50,
    teaser: 'Über einhundert Einzelgewürze, Kräuter, Mischungen und Salze.',
    description:
      'Das Gewürzsortiment deckt alles ab, was in der Räucherei und in der Wurst- und Fleischverarbeitung gebraucht wird: Einzelgewürze ganz und gemahlen, getrocknete Kräuter, fertige Würzmischungen und Salze. Gebindegrößen von 100 g bis 1 kg, damit Sie nicht mehr abnehmen müssen als Sie verarbeiten.',
    metaTitle: 'Naturgewürze für Räucherei und Wurstherstellung',
    metaDescription:
      'Über einhundert Naturgewürze, Kräuter, Würzmischungen und Salze für Räucherei und Fleischverarbeitung. Gebinde von 100 g bis 1 kg.',
    children: [
      {
        slug: 'gewuerze-einzeln',
        name: 'Einzelgewürze',
        icon: 'leaf',
        sortOrder: 10,
        teaser: 'Pfeffer, Paprika, Koriander, Kümmel und die anderen Grundlagen.',
        description:
          'Einzelgewürze ganz und gemahlen. Ganze Gewürze halten ihr Aroma deutlich länger; gemahlene sind schneller einsatzbereit und verteilen sich gleichmäßiger in der Masse.',
        metaTitle: 'Einzelgewürze ganz und gemahlen',
        metaDescription:
          'Einzelgewürze für Räucherei und Wurstherstellung – ganz und gemahlen, in Gebinden von 100 g bis 1 kg.',
      },
      {
        slug: 'kraeuter',
        name: 'Kräuter',
        icon: 'sprout',
        sortOrder: 20,
        teaser: 'Getrocknete Blattgewürze für Lake, Wurstbrät und Marinade.',
        description:
          'Getrocknete Kräuter für Lake, Brät und Marinade. In der Lake entfalten sie ihr Aroma über Stunden, im Brät sofort – die Dosierung unterscheidet sich entsprechend.',
        metaTitle: 'Getrocknete Kräuter für Lake und Wurstbrät',
        metaDescription:
          'Lorbeer, Thymian, Rosmarin, Majoran und weitere getrocknete Kräuter für Räucherlake, Wurstbrät und Marinade.',
      },
      {
        slug: 'gewuerzmischungen',
        name: 'Würzmischungen',
        icon: 'blend',
        sortOrder: 30,
        teaser: 'Abgestimmte Mischungen für Bratwurst, Schinken, Fisch und Wild.',
        description:
          'Fertige Würzmischungen nehmen die Abstimmung ab: Die Anteile sind aufeinander eingestellt, Sie geben nur noch die Menge je Kilogramm zu.',
        metaTitle: 'Würzmischungen für Wurst, Schinken und Fisch',
        metaDescription:
          'Abgestimmte Würzmischungen für Bratwurst, Leberwurst, Salami, Schinken, Fisch und Wild.',
      },
      {
        slug: 'salze',
        name: 'Salze',
        icon: 'salt',
        sortOrder: 40,
        teaser: 'Meersalz, Steinsalz, Räuchersalz und gewürzte Salze.',
        description:
          'Salz ist in der Räucherei kein Nebendarsteller: Es zieht Wasser, festigt das Eiweiß und trägt das Aroma. Die Körnung entscheidet darüber, wie schnell es in Lösung geht.',
        metaTitle: 'Meersalz, Steinsalz und Räuchersalz',
        metaDescription:
          'Meersalz, Steinsalz, Räuchersalz und gewürzte Salze in grober und feiner Körnung für Lake und Trockenpökelung.',
      },
    ],
  },
  {
    slug: 'sonderanfertigungen',
    name: 'Sonderanfertigungen',
    icon: 'ruler',
    sortOrder: 60,
    teaser: 'Aus Kundenprojekten ins Sortiment übernommene Sonderformen und Mustersets.',
    description:
      'Manche Sonderanfertigung ist so gut, dass sie ins Sortiment wandert. Diese Artikel fertigen wir nach Auftrag – die Lieferzeit ist entsprechend länger als bei Lagerware. Wenn Sie etwas anderes brauchen, beschreiben Sie Ihr Projekt im Formular für Sonderanfertigungen.',
    metaTitle: 'Sonderanfertigungen und Mustersets',
    metaDescription:
      'Aus Kundenprojekten übernommene Sonderformen, Mustersets und Aufhängesysteme. Fertigung nach Auftrag.',
  },
]
